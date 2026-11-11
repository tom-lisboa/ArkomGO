package main

import (
	"context"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/crmsync"
	"arkom/bia/internal/solutionbus"
	sdk "clickmax.io/go"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	dsn := os.Getenv("ARKOM_CRM_DATABASE_URL")
	if dsn == "" {
		log.Fatal("ARKOM_CRM_DATABASE_URL is required")
	}
	apiURL := strings.TrimSpace(os.Getenv("ARKOM_CRM_CLICKMAX_DEV_URL"))
	publicDevWorkspace := os.Getenv("ARKOM_CRM_CLICKMAX_PUBLIC_DEV_WORKSPACE")
	if apiURL == "" && clickmax.ValidID(publicDevWorkspace) {
		apiURL = sdk.DefaultBaseURL
	}
	u, err := url.Parse(apiURL)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" ||
		u.User != nil || u.RawQuery != "" || u.Fragment != "" ||
		(strings.EqualFold(u.Hostname(), "mcp.clickmax.io") &&
			(apiURL != sdk.DefaultBaseURL || !clickmax.ValidID(publicDevWorkspace))) {
		log.Fatal("ARKOM_CRM_CLICKMAX_DEV_URL must be the HTTPS Clickmax development endpoint")
	}
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatal("invalid CRM database configuration")
	}
	defer db.Close()
	startup, cancel := context.WithTimeout(ctx, 15*time.Second)
	_, err = db.Exec(startup, crmsync.Schema)
	cancel()
	if err != nil {
		log.Fatal("could not initialize CRM tables in the platform database")
	}
	worker := crmsync.Worker{DB: db, BaseURL: apiURL, PublicDevWorkspace: publicDevWorkspace}
	if addr := os.Getenv("ARKOM_CRM_DEV_LISTEN"); addr != "" {
		host, _, err := net.SplitHostPort(addr)
		if err != nil || host != "127.0.0.1" {
			log.Fatal("CRM dev listener requires a loopback address")
		}
		listener, err := net.Listen("tcp", addr)
		if err != nil {
			log.Fatal("could not start CRM dev listener")
		}
		mux := http.NewServeMux()
		solutionbus.Server{DB: db, CRM: &worker}.Mount(mux)
		server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 30 * time.Second}
		defer server.Close()
		go func() {
			if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
				log.Print("CRM dev listener stopped")
				stop()
			}
		}()
	}
	for ctx.Err() == nil {
		worked, err := worker.ProcessOne(ctx)
		if err != nil && ctx.Err() == nil {
			log.Print("CRM delivery storage unavailable")
		}
		if worked && err == nil {
			continue
		}
		timer := time.NewTimer(2 * time.Second)
		select {
		case <-ctx.Done():
		case <-timer.C:
		}
		timer.Stop()
	}
}
