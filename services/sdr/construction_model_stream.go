package main

import (
	"context"
	"deeph/pkg/construction"
	"encoding/json"
	"errors"
	"net/http"
	"reflect"
	"strings"
	"time"

	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/responses"
)

// jsonValueEnd recognizes balanced JSON values without interpreting text inside
// strings. It never treats braces/keys inside generated source as an action.
func jsonValueEnd(s string, start int) (int, bool) {
	if start >= len(s) {
		return len(s), false
	}
	quote, escape, depth := false, false, 0
	for i := start; i < len(s); i++ {
		c := s[i]
		if quote {
			if escape {
				escape = false
			} else if c == '\\' {
				escape = true
			} else if c == '"' {
				quote = false
				if depth == 0 {
					return i + 1, true
				}
			}
			continue
		}
		switch c {
		case '"':
			quote = true
		case '{', '[':
			depth++
		case '}', ']':
			depth--
			if depth == 0 {
				return i + 1, true
			}
		case ',', ':', ' ', '\n', '\r', '\t':
			if depth == 0 && i > start {
				return i, true
			}
		}
	}
	return len(s), false
}
func jsonSpace(s string, i int) int {
	for i < len(s) && strings.ContainsRune(" \n\r\t", rune(s[i])) {
		i++
	}
	return i
}
func jsonPrefixFields(s string, visit func(string, string, bool) error) error {
	i := jsonSpace(s, 0)
	if i >= len(s) || s[i] != '{' {
		return nil
	}
	i++
	for {
		i = jsonSpace(s, i)
		if i >= len(s) || s[i] == '}' {
			return nil
		}
		if s[i] == ',' {
			i++
			continue
		}
		if s[i] != '"' {
			return nil
		}
		end, ok := jsonValueEnd(s, i)
		if !ok {
			return nil
		}
		var key string
		if json.Unmarshal([]byte(s[i:end]), &key) != nil {
			return errors.New("model_output_invalid")
		}
		i = jsonSpace(s, end)
		if i >= len(s) || s[i] != ':' {
			return nil
		}
		i = jsonSpace(s, i+1)
		end, ok = jsonValueEnd(s, i)
		if err := visit(key, s[i:end], ok); err != nil {
			return err
		}
		if !ok {
			return nil
		}
		i = end
	}
}

type constructionStreamParser struct {
	raw        strings.Builder
	actions    []construction.Action
	summary    string
	generating map[string]bool
	emit       func(construction.Progress) error
}

func (p *constructionStreamParser) feed(delta string) error {
	if p.raw.Len()+len(delta) > 512*1024 {
		return errors.New("model_output_limit")
	}
	p.raw.WriteString(delta)
	return jsonPrefixFields(p.raw.String(), func(key, value string, complete bool) error {
		if key == "summary" && complete && p.summary == "" {
			var summary string
			if json.Unmarshal([]byte(value), &summary) != nil || len(summary) > 2000 {
				return errors.New("model_output_invalid")
			}
			p.summary = summary
			return p.emit(construction.Progress{Summary: summary})
		}
		if key != "actions" {
			return nil
		}
		i := jsonSpace(value, 0)
		if i >= len(value) || value[i] != '[' {
			return nil
		}
		i++
		n := 0
		for {
			i = jsonSpace(value, i)
			if i >= len(value) || value[i] == ']' {
				return nil
			}
			if value[i] == ',' {
				i++
				continue
			}
			end, ok := jsonValueEnd(value, i)
			if !ok {
				fields := map[string]string{}
				_ = jsonPrefixFields(value[i:], func(k, v string, done bool) error {
					if done && (k == "tool" || k == "path") {
						var decoded string
						_ = json.Unmarshal([]byte(v), &decoded)
						fields[k] = decoded
					}
					return nil
				})
				if fields["tool"] == "write" && frontendEditablePath(fields["path"]) && !p.generating[fields["path"]] {
					if p.generating == nil {
						p.generating = map[string]bool{}
					}
					p.generating[fields["path"]] = true
					return p.emit(construction.Progress{Path: fields["path"]})
				}
				return nil
			}
			if n >= 6 {
				return errors.New("invalid_agent_response")
			}
			if n >= len(p.actions) {
				var action construction.Action
				decoder := json.NewDecoder(strings.NewReader(value[i:end]))
				decoder.DisallowUnknownFields()
				if decoder.Decode(&action) != nil || len(action.Content) > 48000 {
					return errors.New("model_output_invalid")
				}
				p.actions = append(p.actions, action)
				if err := p.emit(construction.Progress{Action: &action}); err != nil {
					return err
				}
			}
			n++
			i = end
		}
	})
}
func (p constructionProvider) NextProgressive(ctx context.Context, r construction.Request, emit func(construction.Progress) error) (construction.Turn, error) {
	stream := p.planner.Client.Responses.NewStreaming(ctx, p.constructionParams(r), option.WithHTTPClient(&http.Client{Timeout: 5 * time.Minute, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}))
	defer stream.Close()
	eligible := map[int64]bool{}
	parsers := map[int64]*constructionStreamParser{}
	var result *responses.Response
	for stream.Next() {
		switch event := stream.Current().AsAny().(type) {
		case responses.ResponseOutputItemAddedEvent:
			eligible[event.OutputIndex] = event.Item.Type == "message" && event.Item.Role == "assistant" && (event.Item.Phase == "" || event.Item.Phase == "final_answer")
		case responses.ResponseTextDeltaEvent:
			if !eligible[event.OutputIndex] {
				continue
			}
			parser := parsers[event.OutputIndex]
			if parser == nil {
				if len(parsers) > 0 {
					return construction.Turn{}, errors.New("model_output_invalid")
				}
				parser = &constructionStreamParser{emit: emit}
				parsers[event.OutputIndex] = parser
			}
			if err := parser.feed(event.Delta); err != nil {
				return construction.Turn{}, err
			}
		case responses.ResponseCompletedEvent:
			response := event.Response
			result = &response
		}
	}
	if err := stream.Err(); err != nil {
		return construction.Turn{}, constructionProviderError(ctx, err)
	}
	if result == nil {
		return construction.Turn{}, errors.New("model_output_incomplete")
	}
	turn, err := parseConstructionResponse(*result)
	if err != nil {
		return turn, err
	}
	if len(parsers) != 1 {
		return construction.Turn{}, errors.New("model_output_invalid")
	}
	for _, parser := range parsers {
		if !reflect.DeepEqual(turn.Actions, parser.actions) && !(len(turn.Actions) == 0 && len(parser.actions) == 0) {
			return construction.Turn{}, errors.New("model_output_changed_after_stream")
		}
	}
	return turn, nil
}
