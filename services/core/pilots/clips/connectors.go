package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"arkom/bia/internal/solutionbus"
	"arkom/bia/internal/solutioninbox"
	contract "arkom/bia/pkg/solutionbus"
	"github.com/jackc/pgx/v5/pgxpool"
)

func runConnectors(role string) error {
	password, err := os.ReadFile("/run/secrets/connector_db_password")
	if err != nil {
		return err
	}
	cfg, err := pgxpool.ParseConfig("postgres://solution_connector@postgres:5432/clips_go_homolog?sslmode=disable")
	if err != nil {
		return err
	}
	cfg.ConnConfig.Password = strings.TrimSpace(string(password))
	cfg.MaxConns = 2
	cfg.ConnConfig.ConnectTimeout = 3 * time.Second
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return err
	}
	defer db.Close()
	if role == "connectors-health" {
		query, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		var healthy bool
		err = db.QueryRow(query, `SELECT count(*)=3 FROM solution_inbox.health WHERE seen_at>now()-interval '60 seconds'`).Scan(&healthy)
		if err != nil {
			return err
		}
		if !healthy {
			return errors.New("integration connectors are not ready")
		}
		return nil
	}
	credentials, err := os.ReadFile("/run/secrets/connector_services")
	if err != nil {
		return err
	}
	var services []solutionbus.Credential
	if json.Unmarshal(credentials, &services) != nil || len(services) != 3 {
		return errors.New("three scoped connector credentials are required")
	}
	connectors := []solutioninbox.Connector{}
	for _, service := range services {
		if service.Solution != "social" && service.Solution != "finance" && service.Solution != "bia-sdr" {
			return errors.New("unexpected connector solution")
		}
		connectors = append(connectors, solutioninbox.Connector{Destination: service.Solution, DB: db, Client: contract.Client{BaseURL: hostedOrigin, Token: service.Token, OrganizationID: service.OrganizationID}})
	}
	tick := time.NewTicker(3 * time.Second)
	defer tick.Stop()
	for {
		for _, connector := range connectors {
			poll, cancel := context.WithTimeout(ctx, 25*time.Second)
			err := connector.Poll(poll)
			cancel()
			if err != nil && ctx.Err() == nil {
				log.Printf("connector %s: %v", connector.Destination, err)
			}
		}
		select {
		case <-ctx.Done():
			return nil
		case <-tick.C:
		}
	}
}
