package sdrsdk

import (
	"regexp"
	"strings"
)

var explicitName = regexp.MustCompile(`(?i)(?:meu nome [ée]|me chamo)\s+([^,;.!?\n]+)`)
var namePrefix = regexp.MustCompile(`(?i)^(?:(?:meu )?nome (?:é|e)|me chamo|sou(?: a| o)?)\s+`)
var nameCorrectionTail = regexp.MustCompile(`(?i)\s*,?\s+n[ãa]o\s+.*$`)
var companyPrefix = regexp.MustCompile(`(?i)^(?:(?:a |minha |nossa )?empresa (?:continua sendo|é|e|se chama)|trabalho na|trabalho no)\s+`)
var toolPrefix = regexp.MustCompile(`(?i)^(?:usamos|utilizamos|hoje usamos|atualmente usamos)\s+`)
var sellersPrefix = regexp.MustCompile(`(?i)^(?:temos|somos)\s+`)
var sellersSuffix = regexp.MustCompile(`(?i)\s+vendedores?\s*$`)

// CanonicalDecision stores the smallest explicit value, not a sentence which
// includes a superseded name. Every resulting value still needs source validation.
// This is a correction of an extracted field, never an inferred new field.
func CanonicalDecision(c Prepared, d Decision) Decision {
	d.Facts = append([]ExtractedFact(nil), d.Facts...)
	for i, f := range d.Facts {
		value := strings.TrimSpace(f.Value)
		source := ""
		for _, m := range c.History {
			if m.ID == f.MessageID && m.Role == "user" {
				source = m.Text
				break
			}
		}
		switch f.Key {
		case "name":
			if match := explicitName.FindStringSubmatch(source); len(match) > 1 {
				value = match[1]
			}
			value = namePrefix.ReplaceAllString(value, "")
			value = nameCorrectionTail.ReplaceAllString(value, "")
		case "company":
			value = companyPrefix.ReplaceAllString(value, "")
		case "current_tool":
			value = toolPrefix.ReplaceAllString(value, "")
		case "sellers":
			value = sellersPrefix.ReplaceAllString(value, "")
			value = sellersSuffix.ReplaceAllString(value, "")
		}
		value = strings.TrimSpace(value)
		if value != "" && strings.Contains(Normalized(source), Normalized(value)) {
			d.Facts[i].Value = value
		}
	}
	return d
}
