package construction

import "context"

// CompileFrontendFiles uses the same isolated compiler and artifact receipts as
// generation, without invoking a model or running application/backend code.
func CompileFrontendFiles(ctx context.Context, initial map[string]string, compiler FrontendCompiler) (map[string]string, []Event, error) {
	files := clone(initial)
	var events []Event
	engine := Engine{Tester: frontendEditTester{compiler}}
	err := engine.compileFrontend(ctx, files, "user", func(e Event) error { events = append(events, e); return nil })
	return files, events, err
}

type frontendEditTester struct{ FrontendCompiler }

func (frontendEditTester) Test(context.Context, map[string]string) (string, error) { return "", nil }
