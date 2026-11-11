// Package sdrsdk defines the isolated pilot's worker contracts. Context is owned
// by our store, never by a model provider. No original SDR service is imported.
package sdrsdk

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
)

var ErrUnavailable = errors.New("worker_temporarily_unavailable")
var ErrStale = errors.New("worker_lease_or_context_stale")
var ErrOverflow = errors.New("context_overflow")

type Policy struct {
	Quiet, MaxWait, Lease                                time.Duration
	MaxHistoryMessages, MaxHistoryBytes, MaxContextBytes int
}

func DefaultPolicy() Policy {
	return Policy{Quiet: 5 * time.Second, MaxWait: 30 * time.Second, Lease: 90 * time.Second, MaxHistoryMessages: 20, MaxHistoryBytes: 24000, MaxContextBytes: 56000}
}
func (p Policy) Due(first, last time.Time) time.Time {
	a, b := last.Add(p.Quiet), first.Add(p.MaxWait)
	if a.After(b) {
		return b
	}
	return a
}

type HistoryMessage struct {
	ID       string `json:"id"`
	Sequence int    `json:"sequence"`
	Role     string `json:"role"`
	Text     string `json:"text"`
}
type Fact struct {
	Key       string    `json:"key"`
	Value     string    `json:"value"`
	MessageID string    `json:"message_id"`
	Sequence  int       `json:"sequence"`
	ExpiresAt time.Time `json:"expires_at"`
}
type Candidate struct {
	QualificationFields []string         `json:"qualification_fields,omitempty"`
	Calendar            json.RawMessage  `json:"calendar,omitempty"`
	Organization        string           `json:"organization_id"`
	Conversation        string           `json:"conversation_id"`
	Generation          int              `json:"generation"`
	InputVersion        int              `json:"input_version"`
	BusinessVersion     int              `json:"business_version"`
	BusinessFingerprint string           `json:"business_fingerprint"`
	Business            json.RawMessage  `json:"business"`
	InputIDs            []string         `json:"input_ids"`
	History             []HistoryMessage `json:"history"`
	Memory              []Fact           `json:"memory"`
	At                  time.Time        `json:"at"`
}
type Prepared struct {
	Candidate
	Digest        string `json:"digest"`
	Truncated     bool   `json:"truncated"`
	PromptVersion string `json:"prompt_version"`
}

func Digest(v any) string { b, _ := json.Marshal(v); return fmt.Sprintf("%x", sha256.Sum256(b)) }
func BuildContext(in Candidate, p Policy) (Prepared, error) {
	c := in
	c.History = []HistoryMessage{}
	c.Memory = []Fact{}
	c.InputIDs = slices.Clone(in.InputIDs)
	c.Business = slices.Clone(in.Business)
	c.Calendar = slices.Clone(in.Calendar)
	c.QualificationFields = slices.Clone(in.QualificationFields)
	if in.Organization == "" || in.Conversation == "" || len(in.InputIDs) == 0 || !json.Valid(in.Business) {
		return Prepared{}, errors.New("invalid_context_candidate")
	}
	required := map[string]bool{}
	for _, id := range in.InputIDs {
		required[id] = true
	}
	found := map[string]bool{}
	size := 0
	for i := len(in.History) - 1; i >= 0; i-- {
		m := in.History[i]
		if len(c.History) >= p.MaxHistoryMessages || size+len(m.Text) > p.MaxHistoryBytes {
			break
		}
		c.History = append(c.History, m)
		size += len(m.Text)
		found[m.ID] = true
	}
	for id := range required {
		if !found[id] {
			return Prepared{}, ErrOverflow
		}
	}
	slices.Reverse(c.History)
	for _, f := range in.Memory {
		if len(c.Memory) < 16 && f.ExpiresAt.After(in.At) {
			c.Memory = append(c.Memory, f)
		}
	}
	promptVersion, _ := biaPrompt(c.Business)
	out := Prepared{Candidate: c, Truncated: len(c.History) < len(in.History), PromptVersion: promptVersion}
	out.Digest = Digest(out)
	raw, _ := json.Marshal(out)
	if len(raw) > p.MaxContextBytes {
		return Prepared{}, ErrOverflow
	}
	return out, nil
}

type ContextJob struct {
	ID        string    `json:"id"`
	Lease     string    `json:"lease"`
	Candidate Candidate `json:"candidate"`
}
type ExecutionJob struct {
	ID      string   `json:"id"`
	Lease   string   `json:"lease"`
	Context Prepared `json:"context"`
}
type ExtractedFact struct {
	Key       string `json:"key"`
	Value     string `json:"value"`
	MessageID string `json:"message_id"`
}
type Decision struct {
	Calendar     *CalendarIntent `json:"calendar,omitempty"`
	Action       string          `json:"action"`
	Message      string          `json:"message"`
	Reason       string          `json:"reason"`
	Facts        []ExtractedFact `json:"facts"`
	KnowledgeIDs []string        `json:"knowledge_ids"`
}
type Outcome struct {
	Decision     Decision `json:"decision"`
	ResponseID   string   `json:"response_id"`
	InputTokens  int64    `json:"input_tokens"`
	OutputTokens int64    `json:"output_tokens"`
	Model        string   `json:"model"`
}
type Planner interface {
	Generate(context.Context, Prepared) (Outcome, error)
}
type ContextQueue interface {
	ClaimContext(context.Context) (ContextJob, bool, error)
	CompleteContext(context.Context, ContextJob, Prepared) error
	FailContext(context.Context, ContextJob, string) error
}
type ExecutionQueue interface {
	ClaimExecution(context.Context) (ExecutionJob, bool, error)
	CompleteExecution(context.Context, ExecutionJob, Outcome) error
	FailExecution(context.Context, ExecutionJob, string) error
}

func Normalized(s string) string { return strings.ToLower(strings.Join(strings.Fields(s), " ")) }
