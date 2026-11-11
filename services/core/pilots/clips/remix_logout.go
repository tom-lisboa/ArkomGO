package main

import "context"

func (a identityAuth) logoutBrowserSession(ctx context.Context, hash string) error {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `DELETE FROM customer_sessions WHERE token_hash=$1`, hash); err != nil {
		return err
	}
	if a.remixBackend != "" {
		if _, err = tx.Exec(ctx, `UPDATE remix_sessions SET revoked_at=now() WHERE parent_session_hash=$1 AND revoked_at IS NULL`, hash); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
