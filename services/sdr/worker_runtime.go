package main

import (
	"context"
	"crypto/sha256"
	"errors"
	"flag"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"sdr-next-pilot/internal/calendarworker"
	"sdr-next-pilot/internal/contextworker"
	"sdr-next-pilot/internal/executionworker"
	"sdr-next-pilot/internal/mediaworker"
	"sdr-next-pilot/internal/metricsworker"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
	"syscall"
	"time"
)

// Same opt-out expressions used by the original Go SDR; copied, not imported.
var pipelineStopRE = regexp.MustCompile(`(?im)(pare de (me )?(ligar|mandar|enviar)|n[ãa]o (me )?ligue|n[ãa]o quero (mais )?(ligaç[õo]es|ligacoes|chamadas)|não (me )?(mande|envie)|nao (me )?(mande|envie)|remova meu|exclua meu|não quero (mais )?receber|nao quero (mais )?receber|^sair$|^stop$)`)

func pipelineOptOut(s string) bool { return pipelineStopRE.MatchString(strings.TrimSpace(s)) }
func workerToken(role string) (string, error) {
	if role != "context" && role != "execution" && role != "media" && role != "metrics" && role != "calendar" {
		return "", errors.New("unknown_worker")
	}
	b, e := os.ReadFile(localSecretPath(role + "-worker"))
	if e != nil || len(strings.TrimSpace(string(b))) < 32 {
		return "", errors.New("worker_secret_missing")
	}
	return strings.TrimSpace(string(b)), nil
}
func (a *App) configurePipeline() error {
	if os.Getenv("SDR_PIPELINE_ENABLED") != "true" {
		return nil
	}
	a.workerSecrets = map[string][32]byte{}
	for _, role := range []string{"context", "execution"} {
		s, e := workerToken(role)
		if e != nil {
			return e
		}
		a.workerSecrets[role] = sha256.Sum256([]byte(s))
	}
	a.mediaEnabled = os.Getenv("SDR_MEDIA_ENABLED") == "true"
	if a.mediaEnabled {
		secret, err := workerToken("media")
		if err != nil {
			return err
		}
		a.workerSecrets["media"] = sha256.Sum256([]byte(secret))
	}
	if os.Getenv("SDR_METRICS_ENABLED") == "true" {
		secret, err := workerToken("metrics")
		if err != nil {
			return err
		}
		admin, err := os.ReadFile("/run/secrets/metrics-admin")
		if err != nil || len(strings.TrimSpace(string(admin))) < 32 {
			return errors.New("metrics_admin_missing")
		}
		a.workerSecrets["metrics"] = sha256.Sum256([]byte(secret))
		a.ops = newMetricsOps(strings.TrimSpace(string(admin)), secret, "http://sdr-next-metrics:8090")
	}
	if os.Getenv("SDR_CALENDAR_ENABLED") == "true" {
		secret, err := workerToken("calendar")
		if err != nil {
			return err
		}
		a.workerSecrets["calendar"] = sha256.Sum256([]byte(secret))
	}
	a.executionModel = strings.TrimSpace(os.Getenv("SDR_OPENAI_MODEL"))
	if a.executionModel == "" {
		return errors.New("worker_model_missing")
	}
	a.pipelineEnabled = true
	ln, e := net.Listen("tcp4", localWorkerAddress())
	if e != nil {
		return e
	}
	go func() {
		s := http.Server{Handler: a.privateWorkers(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 30 * time.Second}
		if s.Serve(ln) != nil {
			log.Print("private worker listener stopped")
		}
	}()
	return nil
}
func workerEntrypoint() bool {
	mode := flag.String("worker", "", "context, execution, media, metrics or calendar; empty starts the API")
	flag.Parse()
	if *mode == "" {
		return false
	}
	if *mode != "context" && *mode != "execution" && *mode != "media" && *mode != "metrics" && *mode != "calendar" {
		log.Fatal("unknown isolated worker mode")
	}
	token, e := workerToken(*mode)
	if e != nil {
		log.Fatal("worker credential missing")
	}
	model := ""
	if *mode == "execution" {
		model = strings.TrimSpace(os.Getenv("SDR_OPENAI_MODEL"))
	}
	client, e := sdrsdk.NewClient("http://sdr-next-pilot:8081", token, model)
	if e != nil {
		log.Fatal("private worker client invalid")
	}
	if os.Getenv("SDR_CRM_DEV_ENABLED") == "true" {
		if addr := os.Getenv("SDR_LOCAL_WORKER_LISTEN"); addr != "" {
			if localWorkerAddress() == "invalid-local-listen-address" {
				log.Fatal("private development worker requires loopback")
			}
			client.Base = "http://" + addr
		}
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if *mode == "calendar" {
		worker := calendarworker.Worker{Queue: client, Provider: func(j sdrsdk.CalendarJob) calendarworker.Provider {
			return calendarworker.NewGoogle(func(ctx context.Context, connection string) (string, error) {
				return client.CalendarCredential(ctx, j, connection)
			})
		}}
		log.Print("isolated calendar worker started")
		worker.Run(ctx)
		return true
	}
	if *mode == "metrics" {
		path := os.Getenv("SDR_METRICS_DB")
		if path == "" {
			path = "/app/metrics-data/metrics.sqlite"
		}
		store, err := metricsworker.Open(path)
		if err != nil {
			log.Fatal("metrics storage unavailable")
		}
		defer store.Close()
		worker := metricsworker.Worker{Source: client, Store: store}
		go worker.Run(ctx)
		server := http.Server{Addr: "0.0.0.0:8090", Handler: store.Handler("Bearer " + token), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 30 * time.Second}
		go func() {
			<-ctx.Done()
			stopCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = server.Shutdown(stopCtx)
		}()
		log.Print("isolated metrics worker started")
		if err = server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Print("metrics report listener stopped")
		}
		return true
	}
	if *mode == "context" {
		log.Print("isolated context worker started")
		w := contextworker.Worker{Queue: client, Policy: sdrsdk.DefaultPolicy()}
		w.Run(ctx)
	} else {
		b, e := os.ReadFile(localSecretPath("pilot-openai"))
		if os.Getenv("SDR_CRM_DEV_ENABLED") == "true" && os.Getenv("OPENAI_API_KEY") != "" {
			b, e = []byte(os.Getenv("OPENAI_API_KEY")), nil
		}
		if e != nil {
			log.Fatal("model credential missing")
		}
		if *mode == "media" {
			processor, err := mediaworker.NewProcessor(strings.TrimSpace(string(b)), os.Getenv("SDR_MEDIA_AUDIO_MODEL"), os.Getenv("SDR_MEDIA_VISION_MODEL"))
			if err != nil {
				log.Fatal("media configuration invalid")
			}
			log.Print("isolated media worker started")
			worker := mediaworker.Worker{Queue: client, Processor: processor}
			worker.Run(ctx)
			return true
		}
		planner, e := sdrsdk.NewOpenAI(strings.TrimSpace(string(b)), model)
		if e != nil {
			log.Fatal("model configuration invalid")
		}
		log.Print("isolated execution worker started")
		w := executionworker.Worker{Queue: client, Planner: planner}
		w.Run(ctx)
	}
	return true
}
