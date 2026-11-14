package sdrsdk

import "context"

func (c *Client) ProcessFollowup(ctx context.Context) (bool, error) {
	return c.post(ctx, "/internal/workers/followup/process", struct{}{}, nil)
}
