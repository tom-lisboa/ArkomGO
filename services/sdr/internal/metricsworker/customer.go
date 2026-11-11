package metricsworker

import "time"

// CustomerReport excludes the monitor's global cursor, organization directory,
// global counters and operational authority. Its scope is mandatory.
type CustomerReport struct {
	Organization   string     `json:"organization_id"`
	GeneratedAt    time.Time  `json:"generated_at"`
	From           time.Time  `json:"from"`
	Days           int        `json:"days"`
	Workers        []Counter  `json:"workers"`
	Heat           []HeatCell `json:"heat"`
	Chains         []Chain    `json:"chains"`
	Limited        bool       `json:"limited"`
	CollectedSince string     `json:"collected_since"`
	RetentionDays  int        `json:"retention_days"`
}

func (s *Store) CustomerReport(now time.Time, days int, org, mode string) (CustomerReport, error) {
	r, e := s.Report(now, days, org, mode)
	return CustomerReport{Organization: org, GeneratedAt: r.GeneratedAt, From: r.From, Days: days, Workers: r.Workers, Heat: r.Heat, Chains: r.Chains, Limited: r.GraphLimited, CollectedSince: r.Monitor.CollectedSince, RetentionDays: 90}, e
}
