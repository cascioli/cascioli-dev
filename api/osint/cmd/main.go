package main

import (
	"log"
	"net/http"
	"os"

	handler "github.com/cascioli/api/osint"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8787"
	}
	http.HandleFunc("/api/osint/scan", handler.Handler)
	log.Printf("→  API listening on http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
