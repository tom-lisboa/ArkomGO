package store

import (
	"context"
	"time"
)

// NextOutboundSendAt estimates when both rolling quotas next admit a send.
// A running job has no known completion time. If only in-flight jobs fill a
// quota, retry shortly and check the counts again before contacting the provider.
func (d *DB) NextOutboundSendAt(ctx context.Context, lead string, perLead, global int) (time.Time, error) {
	var due time.Time
	err := d.Pool.QueryRow(ctx, `WITH sent AS (
 SELECT j.lead_id,COALESCE(j.completed_at,j.due_at) AS sent_at
 FROM bia_go.jobs j WHERE `+outboundSendJob+`
 AND j.status IN ('done','uncertain') AND COALESCE(j.completed_at,j.due_at)>now()-interval '24 hours'
 )
 SELECT GREATEST(now()+interval '5 seconds',
   (SELECT sent_at+interval '1 hour' FROM sent WHERE sent_at>now()-interval '1 hour'
    ORDER BY sent_at DESC LIMIT 1 OFFSET $3),
   (SELECT sent_at+interval '24 hours' FROM sent WHERE lead_id=$1
    ORDER BY sent_at DESC LIMIT 1 OFFSET $2)
 )`, lead, max(perLead-1, 0), max(global-1, 0)).Scan(&due)
	return due, err
}

// DeferJob reschedules a policy delay without spending the provider retry budget.
// The same job ID is retained; no duplicate delivery is created.
func (d *DB) DeferJob(ctx context.Context, j Job, due time.Time, reason string) error {
	tx, e := d.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	ct, e := tx.Exec(ctx, `UPDATE bia_go.leads SET lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND lease_until>now()`, j.LeadID, j.Token)
	if e != nil {
		return e
	}
	if ct.RowsAffected() != 1 {
		return ErrLease
	}
	ct, e = tx.Exec(ctx, `UPDATE bia_go.jobs SET status='pending',due_at=$3,error_code=$4,lease_token=NULL,attempts=GREATEST(attempts-1,0) WHERE id=$1 AND lease_token=$2`, j.ID, j.Token, due, reason)
	if e != nil {
		return e
	}
	if ct.RowsAffected() != 1 {
		return ErrLease
	}
	return tx.Commit(ctx)
}
