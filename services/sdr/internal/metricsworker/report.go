package metricsworker

import (
	"encoding/json"
	"slices"
	"sort"
	"strings"
	"time"
)

type Counter struct {
	ID        string `json:"id"`
	Starts    int64  `json:"starts"`
	Jobs      int64  `json:"jobs"`
	Completed int64  `json:"completed"`
	Failed    int64  `json:"failed"`
	Cancelled int64  `json:"cancelled"`
	Expired   int64  `json:"expired"`
	Waiting   int64  `json:"waiting_download"`
	Uncertain int64  `json:"uncertain"`
	Running   int64  `json:"running"`
	LastAt    int64  `json:"last_at"`
}
type HeatCell struct {
	Organization string `json:"organization_id"`
	Worker       string `json:"worker"`
	Starts       int64  `json:"starts"`
}
type Chain struct {
	Workers []string `json:"workers"`
	Count   int      `json:"count"`
	Partial bool     `json:"partial"`
}
type Report struct {
	Mode          string     `json:"mode"`
	GeneratedAt   time.Time  `json:"generated_at"`
	From          time.Time  `json:"from"`
	Days          int        `json:"days"`
	Organization  string     `json:"organization_id"`
	Organizations []string   `json:"organizations"`
	Workers       []Counter  `json:"workers"`
	Clients       []Counter  `json:"clients"`
	Heat          []HeatCell `json:"heat"`
	Chains        []Chain    `json:"chains"`
	GraphLimited  bool       `json:"graph_limited"`
	Monitor       struct {
		Source         string `json:"source"`
		Cursor         int64  `json:"cursor"`
		CollectedSince string `json:"collected_since"`
		LastPoll       int64  `json:"last_poll"`
		LastBatch      int64  `json:"last_batch"`
		Batches        int64  `json:"batches"`
		Events         int64  `json:"events"`
		Gaps           int64  `json:"gaps"`
		Errors         int64  `json:"errors"`
	} `json:"monitor"`
}

const aggregate = `count(*),count(DISTINCT job),sum(outcome='completed'),sum(outcome='failed'),sum(outcome='cancelled'),sum(outcome='expired'),sum(outcome='waiting_download'),sum(outcome='uncertain'),sum(outcome='running'),max(started)`

type graphJob struct {
	Org, Worker, Outcome string
	Parents              []string
}

func (s *Store) Report(now time.Time, days int, org string, modes ...string) (Report, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r := Report{GeneratedAt: now.UTC(), From: now.Add(-time.Duration(days) * 24 * time.Hour).UTC(), Days: days, Organization: org, Organizations: []string{}, Workers: []Counter{}, Clients: []Counter{}, Heat: []HeatCell{}, Chains: []Chain{}}
	if e := s.db.QueryRow("SELECT source,cursor,since,last_poll,last_batch,batches,events,gaps,errors FROM checkpoint WHERE id=1").Scan(&r.Monitor.Source, &r.Monitor.Cursor, &r.Monitor.CollectedSince, &r.Monitor.LastPoll, &r.Monitor.LastBatch, &r.Monitor.Batches, &r.Monitor.Events, &r.Monitor.Gaps, &r.Monitor.Errors); e != nil {
		return r, e
	}
	directoryWhere := "started>=?"
	directoryArgs := []any{now.Add(-90 * 24 * time.Hour).UnixMilli()}
	if org != "" {
		directoryWhere += " AND organization=?"
		directoryArgs = append(directoryArgs, org)
	}
	rows, e := s.db.Query("SELECT DISTINCT organization FROM attempts WHERE "+directoryWhere+" ORDER BY organization LIMIT 201", directoryArgs...)
	if e != nil {
		return r, e
	}
	for rows.Next() {
		var id string
		if e = rows.Scan(&id); e != nil {
			rows.Close()
			return r, e
		}
		r.Organizations = append(r.Organizations, id)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return r, e
	}
	where := "started>=? AND started<=?"
	args := []any{r.From.UnixMilli(), now.UnixMilli()}
	if len(modes) > 0 {
		r.Mode = modes[0]
	}
	if r.Mode != "" {
		where += " AND mode=?"
		args = append(args, r.Mode)
	}
	if org != "" {
		where += " AND organization=?"
		args = append(args, org)
	}
	for _, group := range []string{"worker", "organization"} {
		rows, e = s.db.Query("SELECT "+group+","+aggregate+" FROM attempts WHERE "+where+" GROUP BY "+group+" ORDER BY count(*) DESC,"+group+" LIMIT 201", args...)
		if e != nil {
			return r, e
		}
		for rows.Next() {
			var c Counter
			if e = rows.Scan(&c.ID, &c.Starts, &c.Jobs, &c.Completed, &c.Failed, &c.Cancelled, &c.Expired, &c.Waiting, &c.Uncertain, &c.Running, &c.LastAt); e != nil {
				rows.Close()
				return r, e
			}
			if group == "worker" {
				r.Workers = append(r.Workers, c)
			} else {
				r.Clients = append(r.Clients, c)
			}
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return r, e
		}
	}
	rows, e = s.db.Query("SELECT organization,worker,count(*) FROM attempts WHERE "+where+" GROUP BY organization,worker ORDER BY organization,worker LIMIT 10001", args...)
	if e != nil {
		return r, e
	}
	for rows.Next() {
		var cell HeatCell
		if e = rows.Scan(&cell.Organization, &cell.Worker, &cell.Starts); e != nil {
			rows.Close()
			return r, e
		}
		r.Heat = append(r.Heat, cell)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return r, e
	}
	rows, e = s.db.Query("SELECT organization,worker,job,parents,outcome FROM attempts WHERE "+where+" ORDER BY started DESC LIMIT 10001", args...)
	if e != nil {
		return r, e
	}
	jobs := map[string]graphJob{}
	count := 0
	for rows.Next() {
		var j graphJob
		var id, parents string
		if e = rows.Scan(&j.Org, &j.Worker, &id, &parents, &j.Outcome); e != nil {
			rows.Close()
			return r, e
		}
		count++
		if count > 10000 {
			r.GraphLimited = true
			continue
		}
		_ = json.Unmarshal([]byte(parents), &j.Parents)
		if _, exists := jobs[id]; !exists {
			jobs[id] = j
		}
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return r, e
	}
	r.Chains = causalChains(jobs)
	if len(r.Workers) > 200 || len(r.Clients) > 200 || len(r.Organizations) > 200 || len(r.Heat) > 10000 {
		r.GraphLimited = true
	}
	return r, nil
}

// Count one distinct worker path per terminal job. Parallel media branches with
// the same worker path do not multiply a single turn; retries remain separate
// activations above, but are one logical job in this graph. Never join by time.
func causalChains(jobs map[string]graphJob) []Chain {
	parentsUsed := map[string]bool{}
	for _, j := range jobs {
		for _, p := range j.Parents {
			if parent, ok := jobs[p]; ok && parent.Org == j.Org {
				parentsUsed[p] = true
			}
		}
	}
	type path struct {
		Workers []string
		Partial bool
	}
	var walk func(string, map[string]bool, int) []path
	walk = func(id string, seen map[string]bool, depth int) []path {
		j, ok := jobs[id]
		if !ok {
			return nil
		}
		if seen[id] || depth >= 16 {
			return []path{{[]string{j.Worker}, true}}
		}
		copySeen := map[string]bool{}
		for k, v := range seen {
			copySeen[k] = v
		}
		copySeen[id] = true
		if len(j.Parents) == 0 {
			return []path{{[]string{j.Worker}, false}}
		}
		out := []path{}
		for _, parent := range j.Parents {
			p, exists := jobs[parent]
			if !exists || p.Org != j.Org {
				out = append(out, path{[]string{j.Worker}, true})
				continue
			}
			for _, prefix := range walk(parent, copySeen, depth+1) {
				out = append(out, path{append(slices.Clone(prefix.Workers), j.Worker), prefix.Partial})
				if len(out) >= 64 {
					return out
				}
			}
		}
		return out
	}
	totals := map[string]*Chain{}
	for id := range jobs {
		if parentsUsed[id] {
			continue
		}
		seen := map[string]bool{}
		for _, p := range walk(id, map[string]bool{}, 0) {
			key := strings.Join(p.Workers, " → ")
			if p.Partial {
				key += " (partial)"
			}
			if seen[key] {
				continue
			}
			seen[key] = true
			if totals[key] == nil {
				totals[key] = &Chain{Workers: p.Workers, Partial: p.Partial}
			}
			totals[key].Count++
		}
	}
	out := []Chain{}
	for _, v := range totals {
		out = append(out, *v)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return strings.Join(out[i].Workers, "/") < strings.Join(out[j].Workers, "/")
	})
	if len(out) > 50 {
		out = out[:50]
	}
	return out
}
