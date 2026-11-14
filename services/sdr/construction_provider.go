package main

import (
	"context"
	"deeph/pkg/construction"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/responses"
	"github.com/openai/openai-go/v3/shared"
	"net/http"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
	"time"
)

type constructionProvider struct {
	planner *sdrsdk.OpenAIPlanner
	effort  shared.ReasoningEffort
}

// Construction has its own model budget, independent of customer SDR conversations.
func newConstructionProvider(key, model, effort string) (constructionProvider, error) {
	model = strings.TrimSpace(model)
	if model == "" {
		model = "gpt-6.1-sol"
	}
	effort = strings.TrimSpace(effort)
	if effort == "" {
		effort = "high"
	}
	switch effort {
	case "low", "medium", "high", "xhigh", "max":
	default:
		return constructionProvider{}, errors.New("invalid_genesis_reasoning_effort")
	}
	planner, err := sdrsdk.NewOpenAI(key, model)
	return constructionProvider{planner: planner, effort: shared.ReasoningEffort(effort)}, err
}

func (p constructionProvider) Next(ctx context.Context, r construction.Request) (construction.Turn, error) {
	var turn construction.Turn
	input, _ := json.Marshal(r)
	str := func() map[string]any { return map[string]any{"type": "string"} }
	schema := map[string]any{"type": "object", "additionalProperties": false, "required": []string{"summary", "actions", "verdict"}, "properties": map[string]any{
		"summary": str(), "verdict": map[string]any{"type": "string", "enum": []string{"continue", "ready", "blocked"}},
		"actions": map[string]any{"type": "array", "maxItems": 6, "items": map[string]any{"type": "object", "additionalProperties": false, "required": []string{"tool", "path", "content"}, "properties": map[string]any{"tool": map[string]any{"type": "string", "enum": []string{"read", "list", "write", "test"}}, "path": str(), "content": str()}}},
	}}
	params := responses.ResponseNewParams{Model: p.planner.Model, Instructions: openai.String(r.Instruction), Input: responses.ResponseNewParamsInputUnion{OfString: openai.String(string(input))}, Store: openai.Bool(false), MaxOutputTokens: openai.Int(32000), Reasoning: shared.ReasoningParam{Effort: p.effort}, Text: responses.ResponseTextConfigParam{Format: responses.ResponseFormatTextConfigUnionParam{OfJSONSchema: &responses.ResponseFormatTextJSONSchemaConfigParam{Name: "construction_actions", Strict: openai.Bool(true), Schema: schema}}}}
	result, err := p.planner.Client.Responses.New(ctx, params, option.WithHTTPClient(&http.Client{Timeout: 5 * time.Minute, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}))
	if err != nil {
		var apiErr *openai.Error
		if errors.As(err, &apiErr) {
			if apiErr.StatusCode == 429 || apiErr.StatusCode >= 500 {
				return turn, construction.ErrProviderUnavailable
			}
			return turn, fmt.Errorf("model_http_%d", apiErr.StatusCode)
		}
		if ctx.Err() != nil {
			return turn, ctx.Err()
		}
		return turn, construction.ErrProviderUnavailable
	}
	return parseConstructionResponse(*result)
}

// Structured actions belong to the final answer, never commentary/preambles.
// OutputText concatenates both phases, which can produce invalid JSON or execute
// an intermediate plan instead of the model's completed action batch.
func parseConstructionResponse(result responses.Response) (construction.Turn, error) {
	var turn construction.Turn
	if result.Status != "completed" {
		return turn, errors.New("model_output_incomplete")
	}
	var candidates []string
	for _, item := range result.Output {
		if item.Type != "message" || item.Role != "assistant" || (item.Phase != "" && item.Phase != "final_answer") {
			continue
		}
		var text strings.Builder
		for _, content := range item.Content {
			if content.Type == "refusal" {
				return turn, errors.New("model_refused")
			}
			if content.Type == "output_text" {
				text.WriteString(content.Text)
			}
		}
		if text.Len() > 0 {
			candidates = append(candidates, text.String())
		}
	}
	if len(candidates) != 1 || json.Unmarshal([]byte(candidates[0]), &turn) != nil {
		return turn, errors.New("model_output_invalid")
	}
	if (turn.Verdict != "continue" && turn.Verdict != "ready" && turn.Verdict != "blocked") || len(turn.Actions) > 6 {
		return construction.Turn{}, errors.New("model_output_invalid")
	}
	return turn, nil
}
