package construction

import (
	"bufio"
	"context"
	"deeph/pkg/application"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const RuntimeReference = `PRÉVIA EXECUTÁVEL: escreva os arquivos Go da raiz backend/ no package solution e exponha func NewHandler(tenant platform.Tenant) http.Handler, importando arkom.local/solution/platform. O host cria um processo isolado por empresa e revisão, chama NewHandler uma vez e encaminha somente rotas declaradas em application.json. Use tenant.OrganizationID como identidade confiável, nunca um ID vindo do corpo. Implemente handlers net/http e testes httptest. Não abra portas nem escreva main: backend/cmd/arkom-runtime é reservado ao host. A interface usa fetch('/api/...',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(...)}) e trata falhas. Somente JSON/texto até 32KB por pedido e 64KB por resposta; sem rede externa. Estado em memória dura até parar ou expirar a prévia (5 minutos). Para salvar um documento JSON (até 16 KiB) use platform.LoadData(r.Context()) e platform.SaveData(r.Context(), json.RawMessage), consulte reference/platform-data.go. O documento é isolado por empresa e application_id, compartilhado entre revisões, e sobrevive ao reinício. SaveData prepara uma escrita: o host só confirma após resposta 2xx e commit; qualquer falha deve ser tratada pela interface. Use somente dentro do handler, sem goroutines em background. Para criar e listar vários registros persistentes use platform.CreateRecord(r.Context(), json.RawMessage) e platform.ListRecords(r.Context()); consulte reference/platform-records.go. Há uma coleção separada do documento, até 20 registros de 2 KiB de JSON canônico cada, em ordem de criação. O host gera ID e data; cada requisição pode criar somente um registro e a confirmação também depende de resposta 2xx e commit. Trate ErrRecordsLimit/ErrInvalidRecord e confirme o status no frontend. Não há edição, exclusão ou migração automática do documento. Memória comum continua temporária. Adaptadores de capacidades ainda não estão disponíveis: aplicações com capabilities não vazias precisam desses adaptadores antes de executar.`

type RuntimeRequest struct {
	Records *RecordsSnapshot `json:"-"`
	Data    *DataSnapshot    `json:"-"`
	Method  string           `json:"method"`
	Path    string           `json:"path"`
	Body    string           `json:"body"`
}
type RuntimeReply struct {
	RecordCreate *Record    `json:"record_create,omitempty"`
	DataWrite    *DataWrite `json:"data_write,omitempty"`
	Status       int        `json:"status"`
	Body         string     `json:"body"`
	ContentType  string     `json:"content_type"`
}
type Runtime interface {
	Call(context.Context, RuntimeRequest) (RuntimeReply, error)
	Close()
	Done() <-chan struct{}
}

func RuntimeCompatible(files map[string]string) bool {
	found := false
	for name, source := range files {
		if !strings.HasPrefix(name, "backend/") || strings.Count(name, "/") != 1 || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		f, err := parser.ParseFile(token.NewFileSet(), name, source, 0)
		if err != nil || f.Name.Name != "solution" {
			return false
		}
		for _, decl := range f.Decls {
			if fn, ok := decl.(*ast.FuncDecl); ok && fn.Recv == nil && fn.Name.Name == "NewHandler" {
				found = true
			}
		}
	}
	return found
}

type processRuntime struct {
	mu     sync.Mutex
	in     io.WriteCloser
	reader *bufio.Scanner
	cancel context.CancelFunc
	done   chan struct{}
}

func (p *processRuntime) Done() <-chan struct{} { return p.done }
func (p *processRuntime) Close()                { p.cancel() }
func (p *processRuntime) exchange(ctx context.Context, v any) (RuntimeReply, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	result := make(chan struct {
		r RuntimeReply
		e error
	}, 1)
	go func() {
		var r RuntimeReply
		err := json.NewEncoder(p.in).Encode(v)
		if err == nil {
			if !p.reader.Scan() {
				err = errors.New("runtime_closed")
			} else {
				err = json.Unmarshal(p.reader.Bytes(), &r)
			}
		}
		if err == nil && (r.Status < 200 || r.Status > 599 || len(r.Body) > 65536) {
			err = errors.New("invalid_runtime_response")
		}
		if r.ContentType != "application/json" {
			r.ContentType = "text/plain"
		}
		result <- struct {
			r RuntimeReply
			e error
		}{r, err}
	}()
	select {
	case out := <-result:
		if out.e != nil {
			p.Close()
		}
		return out.r, out.e
	case <-ctx.Done():
		p.Close()
		<-result
		return RuntimeReply{}, ctx.Err()
	case <-p.done:
		<-result
		return RuntimeReply{}, errors.New("runtime_closed")
	}
}
func (p *processRuntime) Call(ctx context.Context, r RuntimeRequest) (RuntimeReply, error) {
	if len(r.Body) > 32768 || len(r.Path) > 2048 {
		return RuntimeReply{}, errors.New("runtime_request_too_large")
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return p.exchange(ctx, runtimeWireRequest(r))
}

// StartRuntime executes only the immutable, validated snapshot supplied by the host.
// No credentials, network, database or host application memory enter the child.
func StartRuntime(ctx context.Context, org string, c *application.Contract, files map[string]string) (Runtime, error) {
	if c == nil || !c.Matches(c.ApplicationID, c.Revision, files) || !FrontendCurrent(files) {
		return nil, errors.New("runtime_contract_invalid")
	}
	if len(c.Manifest.Capabilities) != 0 {
		return nil, errors.New("runtime_capabilities_unavailable")
	}
	if !RuntimeCompatible(files) {
		return nil, errors.New("runtime_entrypoint_missing")
	}
	dir, err := os.MkdirTemp("", "arkom-preview-")
	if err != nil {
		return nil, err
	}
	cleanup := true
	scratch := dir
	defer func() {
		if cleanup {
			os.RemoveAll(scratch)
		}
	}()
	dir, err = filepath.EvalSymlinks(dir)
	if err != nil {
		return nil, err
	}
	for name, data := range files {
		if !strings.HasPrefix(name, "backend/") {
			continue
		}
		if name != "backend/go.mod" && !ValidPath(name) {
			return nil, errors.New("invalid_runtime_path")
		}
		if strings.HasPrefix(name, "backend/cmd/arkom-runtime/") {
			return nil, errors.New("reserved_runtime_path")
		}
		target := filepath.Join(dir, strings.TrimPrefix(name, "backend/"))
		if err = os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return nil, err
		}
		if err = os.WriteFile(target, []byte(data), 0644); err != nil {
			return nil, err
		}
	}
	if err = writeRuntimeAdapter(dir, files); err != nil {
		return nil, err
	}
	if err = os.MkdirAll(filepath.Join(dir, "tmp"), 0755); err != nil {
		return nil, err
	}
	life, cancel := context.WithTimeout(ctx, 5*time.Minute)
	cmd, err := sandboxCommand(life, dir, "run", "./cmd/arkom-runtime")
	if err != nil {
		cancel()
		return nil, err
	}
	isolateProcess(cmd)
	cmd.Dir = dir
	cmd.WaitDelay = time.Second
	in, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		return nil, err
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		in.Close()
		return nil, err
	}
	var diagnostics cappedBuffer
	cmd.Stderr = &diagnostics
	if err = cmd.Start(); err != nil {
		cancel()
		in.Close()
		return nil, errors.New("runtime_start_failed")
	}
	p := &processRuntime{in: in, reader: bufio.NewScanner(out), cancel: cancel, done: make(chan struct{})}
	p.reader.Buffer(make([]byte, 4096), 512*1024)
	cleanup = false
	go func() {
		_ = cmd.Wait()
		finishProcess(cmd)
		cancel()
		in.Close()
		os.RemoveAll(dir)
		close(p.done)
	}()
	startup, stop := context.WithTimeout(life, 100*time.Second)
	defer stop()
	reply, err := p.exchange(startup, map[string]string{"organization_id": org})
	if err != nil || reply.Status != 200 {
		p.Close()
		<-p.Done()
		return nil, fmt.Errorf("runtime_start_failed: %s", strings.ReplaceAll(diagnostics.String(), dir, "/workspace"))
	}
	return p, nil
}

//go:embed runtime_main.go.tmpl
var runtimeMain string
