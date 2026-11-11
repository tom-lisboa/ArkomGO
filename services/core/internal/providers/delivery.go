package providers

import (
	"context"
	"strconv"
	"strings"
	"time"

	"arkom/bia/internal/domain"
)

// RecordDelivery reconciles an existing outbound attempt, never creates or
// retries a message. Terminal receipts cannot be downgraded by late callbacks.
func (t *TwilioMessaging) RecordDelivery(ctx context.Context, m TwilioMessage) error {
	if t.Pool == nil || !ValidMessageSID(m.SID) || m.From != "whatsapp:"+t.Sender || !strings.HasPrefix(m.To, "whatsapp:+") {
		return &Failure{Code: "twilio_receipt_mismatch"}
	}
	switch m.Status {
	case "accepted", "queued", "sending", "sent", "delivered", "read", "failed", "undelivered", "canceled":
	default:
		return &Failure{Code: "twilio_invalid_delivery_status"}
	}
	code := ""
	if m.ErrorCode != nil {
		code = "twilio_" + strconv.Itoa(*m.ErrorCode)
	}
	_, err := t.Pool.Exec(ctx, `WITH receipt AS (
 UPDATE bia_go.twilio_messages SET status=$3,error_code=NULLIF($4,''),updated_at=now()
 WHERE sid=$1 AND phone=$2 AND (
 status NOT IN ('delivered','read','failed','undelivered','canceled') OR status=$3 OR (status='delivered' AND $3='read'))
 RETURNING id
 ) UPDATE bia_go.jobs j SET result=COALESCE(j.result,'{}'::jsonb)||jsonb_build_object('delivery_status',$3::text,'delivery_error_code',NULLIF($4::text,''))
 FROM receipt WHERE j.id=receipt.id`, m.SID, strings.TrimPrefix(m.To, "whatsapp:"), m.Status, code)
	return err
}

// OpeningDelivered prevents follow-on context from being sent after an opening
// that Meta rejected. It does not treat a sent/accepted receipt as delivered.
func (t *TwilioMessaging) OpeningDelivered(ctx context.Context, key string, s domain.State) error {
	if t.Pool == nil {
		return &Failure{Code: "opening_receipt_storage_unavailable"}
	}
	var id, phone string
	if err := t.Pool.QueryRow(ctx, `SELECT COALESCE(sid,''),phone FROM bia_go.twilio_messages WHERE id=$1`, key).Scan(&id, &phone); err != nil || id == "" {
		return &Deferred{Code: "opening_receipt_pending", After: 5 * time.Second}
	}
	if phone != s.Profile.Phone {
		return &Failure{Code: "opening_receipt_mismatch"}
	}
	m, err := t.Fetch(ctx, id)
	if err != nil {
		return &Deferred{Code: "opening_receipt_unavailable", After: 10 * time.Second}
	}
	if m.SID != id || m.From != "whatsapp:"+t.Sender || m.To != "whatsapp:"+phone {
		return &Failure{Code: "opening_receipt_mismatch"}
	}
	if err := t.RecordDelivery(ctx, m); err != nil {
		return err
	}
	switch m.Status {
	case "delivered", "read":
		return nil
	case "failed", "undelivered", "canceled":
		return &Failure{Code: "opening_not_delivered"}
	default:
		return &Deferred{Code: "opening_awaiting_delivery", After: 5 * time.Second}
	}
}
