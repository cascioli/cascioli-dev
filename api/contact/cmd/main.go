package main

import (
	"log"
	"net/http"
	"os"

	handler "github.com/cascioli/api/contact"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8788"
	}
	http.HandleFunc("/api/contact", handler.Handler)
	log.Printf("→  Contact API listening on http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
