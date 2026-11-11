package main

import (
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"sdr-next-pilot/internal/dataworker"
	"sort"
	"strings"
	"sync"
	"time"

	graphql "github.com/graph-gophers/graphql-go"
)

//go:embed customer-schema.graphql
var customerSchemaText string

type customerGraphSchema = graphql.Schema

type customerJSON json.RawMessage

func (customerJSON) ImplementsGraphQLType(name string) bool { return name == "JSON" }
func (j customerJSON) MarshalJSON() ([]byte, error) {
	if len(j) == 0 {
		return []byte("null"), nil
	}
	return j, nil
}
func (j *customerJSON) UnmarshalGraphQL(v any) error { b, e := json.Marshal(v); *j = b; return e }

type customerRequestKey struct{}
type customerRequest struct {
	user  User
	mu    sync.Mutex
	rows  int
	bytes int
	cache map[string][]dataworker.Record
	api   *App
}

func (p *customerRequest) charge(rows, bytes int) error {
	p.rows += rows
	p.bytes += bytes
	if p.rows > 500 || p.bytes > 2<<20 {
		return errors.New("query_budget_exceeded")
	}
	return nil
}
func principal(ctx context.Context) *customerRequest {
	return ctx.Value(customerRequestKey{}).(*customerRequest)
}

type customerRoot struct{ api *App }

func (r *customerRoot) Customer(ctx context.Context) *customerResolver {
	return &customerResolver{principal(ctx)}
}

type customerResolver struct{ p *customerRequest }

func (r *customerResolver) OrganizationID() graphql.ID { return graphql.ID(r.p.user.Org) }
func (r *customerResolver) Collections() []string {
	return append([]string(nil), customerCollections...)
}

type dataRecordResolver struct {
	ID             graphql.ID
	ConversationID *graphql.ID
	RecordedAt     *graphql.Time
	Data           customerJSON
}
type dataPageResolver struct {
	Items      []*dataRecordResolver
	NextCursor *string
	HasMore    bool
}
type dataCursor struct{ Org, Filter, Last string }

func (r *customerResolver) Records(ctx context.Context, args struct {
	Collection     string
	First          int32
	After          *string
	ConversationID *graphql.ID
	From, To       *graphql.Time
}) (*dataPageResolver, error) {
	p := r.p
	p.mu.Lock()
	defer p.mu.Unlock()
	if args.First < 1 || args.First > 100 {
		return nil, errors.New("invalid_page_size")
	}
	if args.From != nil && args.To != nil && args.From.After(args.To.Time) {
		return nil, errors.New("invalid_date_range")
	}
	conversation := ""
	if args.ConversationID != nil {
		conversation = string(*args.ConversationID)
	}
	filter := fingerprint(struct {
		Collection, Conversation string
		From, To                 *graphql.Time
	}{args.Collection, conversation, args.From, args.To})
	last := ""
	if args.After != nil {
		if len(*args.After) > 1000 {
			return nil, errors.New("invalid_cursor")
		}
		raw, e := base64.RawURLEncoding.DecodeString(*args.After)
		var cursor dataCursor
		if e != nil || json.Unmarshal(raw, &cursor) != nil || cursor.Org != p.user.Org || cursor.Filter != filter {
			return nil, errors.New("invalid_cursor")
		}
		last = cursor.Last
	}
	if e := p.charge(int(args.First), 0); e != nil {
		return nil, e
	}
	records, exists := p.cache[args.Collection]
	if !exists {
		p.api.mu.Lock()
		var e error
		records, e = p.api.customerRecords(p.user.Org, args.Collection)
		p.api.mu.Unlock()
		if e != nil {
			return nil, errors.New("dataset_unavailable")
		}
		p.cache[args.Collection] = records
	}
	page := &dataPageResolver{Items: []*dataRecordResolver{}}
	for _, record := range records {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if record.ID <= last || (conversation != "" && record.Conversation != conversation) {
			continue
		}
		if args.From != nil && (record.At.IsZero() || record.At.Before(args.From.Time)) {
			continue
		}
		if args.To != nil && (record.At.IsZero() || record.At.After(args.To.Time)) {
			continue
		}
		if len(page.Items) == int(args.First) {
			page.HasMore = true
			break
		}
		if e := p.charge(0, len(record.Data)); e != nil {
			return nil, e
		}
		item := &dataRecordResolver{ID: graphql.ID(record.ID), Data: customerJSON(record.Data)}
		if record.Conversation != "" {
			v := graphql.ID(record.Conversation)
			item.ConversationID = &v
		}
		if !record.At.IsZero() {
			v := graphql.Time{Time: record.At}
			item.RecordedAt = &v
		}
		page.Items = append(page.Items, item)
	}
	if page.HasMore {
		b, _ := json.Marshal(dataCursor{p.user.Org, filter, string(page.Items[len(page.Items)-1].ID)})
		cursor := base64.RawURLEncoding.EncodeToString(b)
		page.NextCursor = &cursor
	}
	return page, nil
}

type customerUsageResolver struct {
	Available     bool
	Report        *customerJSON
	RetentionDays int32
}

func (r *customerResolver) WorkerUsage(ctx context.Context, args struct{ Days int32 }) (*customerUsageResolver, error) {
	if args.Days < 1 || args.Days > 90 {
		return nil, errors.New("invalid_period")
	}
	r.p.mu.Lock()
	e := r.p.charge(100, 0)
	r.p.mu.Unlock()
	if e != nil {
		return nil, e
	}
	result := &customerUsageResolver{RetentionDays: 90}
	report, e := r.p.api.customerUsage(ctx, r.p.user.Org, int(args.Days))
	if e != nil {
		return result, nil
	}
	raw, _ := json.Marshal(report)
	j := customerJSON(raw)
	result.Available = true
	result.Report = &j
	return result, nil
}

type exportResolver struct {
	ID           graphql.ID    `json:"id"`
	Status       string        `json:"status"`
	CreatedAt    graphql.Time  `json:"createdAt"`
	CapturedAt   *graphql.Time `json:"capturedAt"`
	ExpiresAt    graphql.Time  `json:"expiresAt"`
	DownloadPath *string       `json:"downloadPath"`
	ErrorCode    *string       `json:"errorCode"`
}

func exportView(j *CustomerExport) *exportResolver {
	v := &exportResolver{ID: graphql.ID(j.ID), Status: j.Status, CreatedAt: graphql.Time{Time: j.CreatedAt}, ExpiresAt: graphql.Time{Time: j.ExpiresAt}}
	if !j.CapturedAt.IsZero() {
		v.CapturedAt = &graphql.Time{Time: j.CapturedAt}
	}
	if j.Status == "ready" {
		path := "/v1/customer/exports/" + j.ID + "/content"
		v.DownloadPath = &path
	}
	if j.Error != "" {
		s := j.Error
		v.ErrorCode = &s
	}
	return v
}
func (r *customerResolver) Exports() []*exportResolver {
	r.p.api.mu.Lock()
	defer r.p.api.mu.Unlock()
	out := []*exportResolver{}
	for _, j := range r.p.api.state.CustomerExports {
		if j.Org == r.p.user.Org {
			out = append(out, exportView(j))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt.Time) })
	if len(out) > 20 {
		out = out[:20]
	}
	return out
}
func (a *App) customerGraphQL(w http.ResponseWriter, r *http.Request, u User) {
	if r.Method != "POST" {
		fail(w, 405, "method_not_allowed")
		return
	}
	var body struct {
		Query         string         `json:"query"`
		OperationName string         `json:"operationName"`
		Variables     map[string]any `json:"variables"`
	}
	if !decode(w, r, &body) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	p := &customerRequest{user: u, api: a, cache: map[string][]dataworker.Record{}}
	result := a.customerSchema.Exec(context.WithValue(ctx, customerRequestKey{}, p), body.Query, body.OperationName, body.Variables)
	raw, e := json.Marshal(result)
	if e != nil || len(raw) > 3<<20 {
		fail(w, 422, "query_response_limit")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(raw)
}

func (a *App) customerHTTP(w http.ResponseWriter, r *http.Request) bool {
	if !strings.HasPrefix(r.URL.Path, "/v1/customer/") {
		return false
	}
	u, ok := a.customerAuthorize(w, r)
	if !ok {
		return true
	}
	if r.URL.Path == "/v1/customer/graphql" {
		a.customerGraphQL(w, r, u)
	} else {
		a.customerExportHTTP(w, r, u)
	}
	return true
}
