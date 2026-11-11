package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"arkom/bia/internal/platformdirectory"
	access "arkom/bia/pkg/platformaccess"
	"github.com/jackc/pgx/v5/pgxpool"
)

func directoryCommand(ctx context.Context, db *pgxpool.Pool, role string, input io.Reader, output io.Writer) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	s := platformdirectory.Store{DB: db}
	decode := func(out any) error {
		d := json.NewDecoder(io.LimitReader(input, 128<<10))
		d.DisallowUnknownFields()
		if d.Decode(out) != nil || d.Decode(new(any)) != io.EOF {
			return platformdirectory.ErrInvalid
		}
		return nil
	}
	var out any
	switch role {
	case "directory-installation":
		var in platformdirectory.InstallationInput
		if err := decode(&in); err != nil {
			return err
		}
		v, err := s.RegisterInstallation(ctx, in, false)
		if err != nil {
			return err
		}
		out = v
	case "directory-register":
		var in platformdirectory.Registration
		if err := decode(&in); err != nil {
			return err
		}
		v, err := s.Register(ctx, in)
		if err != nil {
			return err
		}
		out = v
	case "directory-change":
		var in platformdirectory.Change
		if err := decode(&in); err != nil {
			return err
		}
		revision, err := s.Change(ctx, in)
		if err != nil {
			return err
		}
		out = map[string]any{"revision": revision}
	case "directory-bind-service":
		var in struct {
			ClientID string `json:"client_id"`
			Backend  string `json:"backend"`
		}
		if err := decode(&in); err != nil {
			return err
		}
		if err := s.BindService(ctx, in.ClientID, in.Backend); err != nil {
			return err
		}
		out = map[string]bool{"bound": true}
	default:
		return platformdirectory.ErrInvalid
	}
	return json.NewEncoder(output).Encode(out)
}

func (a identityAuth) applyDirectory(ctx context.Context, identity customerIdentity) (customerIdentity, error) {
	if a.directoryBackend == "" {
		return identity, nil
	}
	p, err := (platformdirectory.Store{DB: a.db}).ResolveLocal(ctx, a.directoryBackend, "clips", identity.WorkspaceID, identity.ID)
	if err != nil {
		return customerIdentity{}, err
	}
	if p.OrganizationID != identity.OrganizationID {
		return customerIdentity{}, access.ErrDenied
	}
	identity.Platform = &p
	return identity, nil
}

func directoryError(w http.ResponseWriter, err error) {
	if errors.Is(err, access.ErrDenied) {
		writeError(w, 403, "platform_access_denied")
		return
	}
	writeError(w, 503, "platform_directory_unavailable")
}
