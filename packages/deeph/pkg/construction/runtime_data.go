package construction

import (
	_ "embed"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

const DataContractPath = "backend/platform/data.go"
const MaxDataBytes = 16 * 1024

//go:embed platform_data.go.tmpl
var DataContracts string

//go:embed runtime_data.go.tmpl
var runtimeData string

type DataSnapshot struct {
	Found bool            `json:"found"`
	Value json.RawMessage `json:"value,omitempty"`
}
type DataWrite struct {
	Value json.RawMessage `json:"value"`
}

func DataCompatible(files map[string]string) bool { return files[DataContractPath] == DataContracts }
func ValidData(value json.RawMessage) bool        { return len(value) <= MaxDataBytes && json.Valid(value) }

// Data is host-owned input; it cannot be supplied by the public HTTP envelope.
func runtimeWireRequest(r RuntimeRequest) any {
	return struct {
		Method  string           `json:"method"`
		Path    string           `json:"path"`
		Body    string           `json:"body"`
		Data    *DataSnapshot    `json:"data,omitempty"`
		Records *RecordsSnapshot `json:"records,omitempty"`
	}{r.Method, r.Path, r.Body, r.Data, r.Records}
}
func writeRuntimeAdapter(dir string, files map[string]string) error {
	if value, exists := files[DataContractPath]; exists && value != DataContracts {
		return errors.New("runtime_data_contract_invalid")
	}
	if value, exists := files[RecordsContractPath]; exists && value != RecordsContracts {
		return errors.New("runtime_records_contract_invalid")
	}
	target := filepath.Join(dir, "cmd/arkom-runtime")
	if err := os.MkdirAll(target, 0755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(target, "main.go"), []byte(runtimeMain), 0644); err != nil {
		return err
	}
	adapter := runtimeData
	if !DataCompatible(files) {
		adapter = `package main
import "context"
func requestData(ctx context.Context, _ *dataSnapshot) (context.Context, func() *dataWrite) {
	return ctx, func() *dataWrite { return nil }
}`
	}
	if err := os.WriteFile(filepath.Join(target, "data.go"), []byte(adapter), 0644); err != nil {
		return err
	}
	adapter = runtimeRecords
	if !RecordsCompatible(files) {
		adapter = `package main
import "context"
func requestRecords(ctx context.Context, _ *recordsSnapshot) (context.Context, func() *record) {
	return ctx, func() *record { return nil }
}`
	}
	return os.WriteFile(filepath.Join(target, "records.go"), []byte(adapter), 0644)
}
