package construction

import (
	_ "embed"
	"encoding/json"
	"time"
)

const RecordsContractPath = "backend/platform/records.go"
const MaxRecords = 20
const MaxRecordBytes = 2 * 1024

//go:embed platform_records.go.tmpl
var RecordsContracts string

//go:embed runtime_records.go.tmpl
var runtimeRecords string

type Record struct {
	ID        string          `json:"id"`
	Value     json.RawMessage `json:"value"`
	CreatedAt time.Time       `json:"created_at"`
}
type RecordsSnapshot struct {
	Items         []Record  `json:"items"`
	NextID        string    `json:"next_id"`
	NextCreatedAt time.Time `json:"next_created_at"`
}

func RecordsCompatible(files map[string]string) bool {
	return files[RecordsContractPath] == RecordsContracts
}
func ValidRecord(value json.RawMessage) bool {
	encoded, err := json.Marshal(value)
	return len(value) > 0 && err == nil && len(encoded) <= MaxRecordBytes
}
