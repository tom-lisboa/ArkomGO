package sdrsdk

import (
	"embed"
	"encoding/json"
	"slices"
	"strings"
)

const basePromptVersion = "sdr-next-multicompany-v1"

//go:embed prompts/*.txt
var biaPromptFiles embed.FS

type BiaPreset struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

var biaPresets = []BiaPreset{
	{ID: "comercial-v1", Label: "Atendimento comercial"},
	{ID: "clinica-v1", Label: "Recepção de clínica"},
	{ID: "advocacia-v1", Label: "Recepção de escritório"},
}

func BiaPresets() []BiaPreset {
	return slices.Clone(biaPresets)
}

func ValidBiaPreset(id string) bool {
	return slices.ContainsFunc(biaPresets, func(preset BiaPreset) bool { return preset.ID == id })
}

func biaPrompt(business json.RawMessage) (version string, guidance string) {
	var context struct {
		Preset string `json:"bia_preset"`
	}
	if json.Unmarshal(business, &context) != nil || !ValidBiaPreset(context.Preset) {
		return basePromptVersion, ""
	}
	text, err := biaPromptFiles.ReadFile("prompts/" + context.Preset + ".txt")
	if err != nil {
		return basePromptVersion, ""
	}
	return basePromptVersion + "/" + context.Preset, strings.TrimSpace(string(text))
}
