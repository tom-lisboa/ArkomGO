package voicecall

import (
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var (
	sidBody = regexp.MustCompile("^[0-9a-fA-F]{32}$")
	phone   = regexp.MustCompile("^[+][1-9][0-9]{9,14}$")
)

func SID(value, prefix string) bool {
	return len(value) == 34 && strings.HasPrefix(value, prefix) && sidBody.MatchString(value[2:])
}
func Phone(value string) bool { return phone.MatchString(value) }

type Failure struct {
	Code      string
	Uncertain bool
}

func (f *Failure) Error() string { return f.Code }

type Twilio struct {
	Account, Token, Sender, SenderSID, Template string
	HTTP                                        *http.Client
}

func (t Twilio) request(ctx context.Context, method, endpoint string, values url.Values, out any) error {
	var body io.Reader
	if values != nil {
		body = strings.NewReader(values.Encode())
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return &Failure{Code: "twilio_invalid_request"}
	}
	req.SetBasicAuth(t.Account, t.Token)
	if values != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	res, err := t.HTTP.Do(req)
	if err != nil {
		return &Failure{Code: "twilio_unavailable", Uncertain: method != http.MethodGet}
	}
	defer res.Body.Close()
	decoder := json.NewDecoder(io.LimitReader(res.Body, 256<<10))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		var response struct {
			Code int `json:"code"`
		}
		_ = decoder.Decode(&response)
		code := "twilio_rejected"
		if res.StatusCode == 401 || res.StatusCode == 403 {
			code = "twilio_credentials_rejected"
		} else if response.Code > 0 {
			code = "twilio_" + strconv.Itoa(response.Code)
		}
		return &Failure{Code: code, Uncertain: method != http.MethodGet && res.StatusCode >= 500}
	}
	if out != nil && decoder.Decode(out) != nil {
		return &Failure{Code: "twilio_invalid_response", Uncertain: method != http.MethodGet}
	}
	return nil
}

func (t Twilio) Verify(ctx context.Context, messagingWebhook string) (string, error) {
	var sender struct {
		SID           string `json:"sid"`
		Status        string `json:"status"`
		Sender        string `json:"sender_id"`
		Configuration struct {
			VoiceApp string `json:"voice_application_sid"`
		} `json:"configuration"`
		Webhook struct {
			URL    string `json:"callback_url"`
			Method string `json:"callback_method"`
		} `json:"webhook"`
	}
	if err := t.request(ctx, http.MethodGet, "https://messaging.twilio.com/v2/Channels/Senders/"+t.SenderSID, nil, &sender); err != nil {
		return "", err
	}
	number := strings.TrimPrefix(sender.Sender, "whatsapp:")
	if sender.SID != t.SenderSID || !strings.HasPrefix(sender.Sender, "whatsapp:") || !Phone(number) || sender.Status != "ONLINE" {
		return "", errors.New("twilio_sender_not_online")
	}
	if !SID(sender.Configuration.VoiceApp, "AP") {
		return "", errors.New("twilio_voice_app_required")
	}
	if sender.Webhook.URL != messagingWebhook || sender.Webhook.Method != "POST" {
		return "", errors.New("twilio_webhook_required")
	}
	contentURL := "https://content.twilio.com/v1/Content/" + t.Template
	var content struct {
		Account   string            `json:"account_sid"`
		SID       string            `json:"sid"`
		Variables map[string]string `json:"variables"`
		Types     map[string]struct {
			Actions []struct {
				Type string `json:"type"`
			} `json:"actions"`
		} `json:"types"`
	}
	if err := t.request(ctx, http.MethodGet, contentURL, nil, &content); err != nil {
		return "", err
	}
	hasPermission := false
	for _, action := range content.Types["twilio/call-to-action"].Actions {
		hasPermission = hasPermission || action.Type == "VOICE_CALL_REQUEST"
	}
	if content.Account != t.Account || content.SID != t.Template || !hasPermission || len(content.Variables) != 0 {
		return "", errors.New("twilio_permission_template_invalid")
	}
	var approval struct {
		WhatsApp struct {
			Status string `json:"status"`
		} `json:"whatsapp"`
	}
	if err := t.request(ctx, http.MethodGet, contentURL+"/ApprovalRequests", nil, &approval); err != nil {
		return "", err
	}
	if approval.WhatsApp.Status != "approved" {
		return "", errors.New("twilio_permission_template_not_approved")
	}
	return number, nil
}

func (t Twilio) accountURL(resource string) string {
	return "https://api.twilio.com/2010-04-01/Accounts/" + t.Account + "/" + resource
}

func (t Twilio) RequestPermission(ctx context.Context, to, status string) (string, error) {
	return t.create(ctx, "Messages.json", "SM", url.Values{
		"From": {"whatsapp:" + t.Sender}, "To": {"whatsapp:" + to}, "ContentSid": {t.Template}, "StatusCallback": {status},
	})
}

func (t Twilio) Dial(ctx context.Context, to, answer, status string, limit int) (string, error) {
	return t.create(ctx, "Calls.json", "CA", url.Values{
		"From": {"whatsapp:" + t.Sender}, "To": {"whatsapp:" + to}, "Url": {answer}, "Method": {"POST"},
		"StatusCallback": {status}, "StatusCallbackMethod": {"POST"}, "StatusCallbackEvent": {"initiated", "ringing", "answered", "completed"},
		"Timeout": {"25"}, "TimeLimit": {strconv.Itoa(limit)},
	})
}

func (t Twilio) create(ctx context.Context, path, prefix string, values url.Values) (string, error) {
	var response struct {
		SID string `json:"sid"`
	}
	if err := t.request(ctx, http.MethodPost, t.accountURL(path), values, &response); err != nil {
		return "", err
	}
	if !SID(response.SID, prefix) && !(prefix == "SM" && SID(response.SID, "MM")) {
		return "", &Failure{Code: "twilio_missing_receipt", Uncertain: true}
	}
	return response.SID, nil
}

func (t Twilio) PermissionTime(ctx context.Context, sid, from string) (time.Time, error) {
	if !SID(sid, "SM") && !SID(sid, "MM") {
		return time.Time{}, errors.New("invalid_message_sid")
	}
	var response struct {
		SID     string `json:"sid"`
		Account string `json:"account_sid"`
		From    string `json:"from"`
		To      string `json:"to"`
		Body    string `json:"body"`
		Created string `json:"date_created"`
	}
	if err := t.request(ctx, http.MethodGet, t.accountURL("Messages/"+sid+".json"), nil, &response); err != nil {
		return time.Time{}, err
	}
	if response.SID != sid || response.Account != t.Account || response.From != "whatsapp:"+from || response.To != "whatsapp:"+t.Sender || response.Body != "VOICE_CALL_REQUEST" {
		return time.Time{}, errors.New("twilio_permission_mismatch")
	}
	return time.Parse(time.RFC1123Z, response.Created)
}

func (t Twilio) Hangup(ctx context.Context, sid string) error {
	if !SID(sid, "CA") {
		return errors.New("invalid_call_sid")
	}
	return t.request(ctx, http.MethodPost, t.accountURL("Calls/"+sid+".json"), url.Values{"Status": {"completed"}}, nil)
}

func Signature(token, absolute string, form url.Values) string {
	keys := make([]string, 0, len(form))
	for key := range form {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	mac := hmac.New(sha1.New, []byte(token))
	_, _ = io.WriteString(mac, absolute)
	for _, key := range keys {
		values := append([]string(nil), form[key]...)
		sort.Strings(values)
		for i, value := range values {
			if i == 0 || value != values[i-1] {
				_, _ = io.WriteString(mac, key+value)
			}
		}
	}
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}
