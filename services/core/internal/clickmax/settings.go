package clickmax

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type Settings struct {
	PipelineID                         string
	Stages                             map[string]string
	AutoLinkSince                      time.Time
	MeetingDateField, MeetingTimeField string
}

func ParseSettings(pipeline, mapping string) (Settings, error) {
	s := Settings{PipelineID: strings.ToLower(strings.TrimSpace(pipeline))}
	if !ValidID(s.PipelineID) {
		return s, errors.New("invalid BIA_CLICKMAX_PIPELINE_ID")
	}
	if json.Unmarshal([]byte(mapping), &s.Stages) != nil || len(s.Stages) == 0 {
		return s, errors.New("invalid BIA_CLICKMAX_STAGE_MAP")
	}
	const stages = "|contact_pending|contacted|attempt_2|attempt_3|engaged|scheduling|booked|presence_confirmed|in_meeting|awaiting_attendance|attended|no_show|cancelled|"
	for name, id := range s.Stages {
		if name == "" || !strings.Contains(stages, "|"+name+"|") || strings.Contains(name, "|") || !ValidID(id) {
			return s, errors.New("invalid BIA_CLICKMAX_STAGE_MAP")
		}
		s.Stages[name] = strings.ToLower(id)
	}
	return s, nil
}

func (s Settings) ValidatePipeline(ctx context.Context, c *Client) error {
	_, err := s.ResolvePipeline(ctx, c)
	return err
}

func (s Settings) ResolvePipeline(ctx context.Context, c *Client) (Pipeline, error) {
	pipelines, err := c.Pipelines(ctx)
	if err != nil {
		return Pipeline{}, err
	}
	for _, pipeline := range pipelines {
		if !strings.EqualFold(pipeline.ID, s.PipelineID) || pipeline.ArchivedAt != nil {
			continue
		}
		available := make(map[string]bool, len(pipeline.Stages))
		for _, stage := range pipeline.Stages {
			available[strings.ToLower(stage.ID)] = true
		}
		for _, id := range s.Stages {
			if !available[id] {
				return Pipeline{}, errors.New("clickmax_stage_outside_pipeline")
			}
		}
		return pipeline, nil
	}
	return Pipeline{}, errors.New("clickmax_pipeline_unavailable")
}
