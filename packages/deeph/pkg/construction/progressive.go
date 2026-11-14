package construction

import "context"

// ProgressiveProvider reports only completed structured actions from the final
// answer. A partially generated file never replaces a saved source file.
type ProgressiveProvider interface {
	NextProgressive(context.Context, Request, func(Progress) error) (Turn, error)
}
type Progress struct {
	Summary string
	Path    string
	Action  *Action
}
