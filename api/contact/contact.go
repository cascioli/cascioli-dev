package handler

import (
	"encoding/json"
	"fmt"
	"html"
	"log"
	"net/http"
	"net/mail"
	"os"
	"strings"

	resend "github.com/resend/resend-go/v3"
)

type mxRecord struct {
	Host string `json:"host"`
	Pref uint16 `json:"pref"`
}

type sslInfo struct {
	Issuer string `json:"issuer"`
	Expiry string `json:"expiry"`
	Valid  bool   `json:"valid"`
}

type osintData struct {
	Domain           string     `json:"domain"`
	IsPublicProvider bool       `json:"is_public_provider"`
	IsDisposable     bool       `json:"is_disposable"`
	MX               []mxRecord `json:"mx"`
	SPF              *string    `json:"spf"`
	DMARC            *string    `json:"dmarc"`
	SSL              *sslInfo   `json:"ssl"`
	Infrastructure   *string    `json:"infrastructure"`
	ArchitectScore   int        `json:"architect_score"`
}

type contactRequest struct {
	Name          string     `json:"name"`
	Email         string     `json:"email"`
	Message       string     `json:"message"`
	HoneypotToken string     `json:"architect_validation_token"`
	Osint         *osintData `json:"osint"`
}

type contactResponse struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

// computeRiskScore mirrors the frontend scoring logic.
// Returns -1 when a score is not applicable (public provider or no data).
func computeRiskScore(o *osintData) int {
	if o == nil || o.IsPublicProvider {
		return -1
	}
	if o.IsDisposable {
		return 0
	}
	score := 0
	if len(o.MX) >= 2 {
		score += 30
	} else if len(o.MX) == 1 {
		score += 20
	}
	if o.SPF != nil {
		score += 20
	}
	if o.DMARC != nil {
		score += 25
	}
	if o.SSL != nil && o.SSL.Valid {
		score += 25
	}
	if score > 100 {
		score = 100
	}
	return score
}

func isAllowedOrigin(origin string) bool {
	if origin == "https://simonecascioli.it" || origin == "https://cascioli.dev" {
		return true
	}
	return strings.HasPrefix(origin, "http://localhost:")
}

func esc(s string) string { return html.EscapeString(strings.TrimSpace(s)) }

func buildEmailHTML(name, email, message string, o *osintData, score int) string {
	safeName := esc(name)
	safeEmail := esc(email)
	safeMsg := strings.ReplaceAll(esc(message), "\n", "<br>")

	var osintBox string
	switch {
	case o == nil:
		// no scan data
	case o.IsDisposable:
		osintBox = `<div style="margin-top:20px;padding:12px;background:#18181b;border-radius:8px;border:1px solid #7f1d1d;font-family:monospace;font-size:12px;color:#ef4444;">OSINT · disposable email domain detected</div>`
	case o.IsPublicProvider:
		osintBox = `<div style="margin-top:20px;padding:12px;background:#18181b;border-radius:8px;border:1px solid #27272a;font-family:monospace;font-size:12px;color:#71717a;">OSINT · public email provider — no domain scan performed</div>`
	default:
		spf := "missing"
		if o.SPF != nil {
			spf = esc(*o.SPF)
		}
		dmarc := "missing"
		if o.DMARC != nil {
			dmarc = esc(*o.DMARC)
		}
		ssl := "not checked"
		if o.SSL != nil {
			if o.SSL.Valid {
				ssl = fmt.Sprintf("valid · %s · expires %s", esc(o.SSL.Issuer), esc(o.SSL.Expiry))
			} else {
				ssl = fmt.Sprintf("invalid · %s", esc(o.SSL.Issuer))
			}
		}
		infra := "unknown"
		if o.Infrastructure != nil {
			infra = esc(*o.Infrastructure)
		}
		scoreColor := "#ef4444"
		if score >= 70 {
			scoreColor = "#10b981"
		} else if score >= 40 {
			scoreColor = "#eab308"
		}
		osintBox = fmt.Sprintf(`
<div style="margin-top:24px;padding:16px;background:#18181b;border-radius:8px;border:1px solid #27272a;font-family:monospace;font-size:12px;color:#a1a1aa;">
  <div style="color:#10b981;font-size:11px;letter-spacing:0.12em;margin-bottom:10px;text-transform:uppercase;">Architect OSINT Report</div>
  <table style="width:100%%;border-collapse:collapse;line-height:1.8;">
    <tr><td style="color:#71717a;width:80px;vertical-align:top;">DOMAIN</td><td>%s</td></tr>
    <tr><td style="color:#71717a;">INFRA</td><td>%s</td></tr>
    <tr><td style="color:#71717a;">SPF</td><td>%s</td></tr>
    <tr><td style="color:#71717a;">DMARC</td><td>%s</td></tr>
    <tr><td style="color:#71717a;">SSL</td><td>%s</td></tr>
    <tr><td style="color:#71717a;">SCORE</td><td style="color:%s;font-weight:bold;">%d / 100</td></tr>
  </table>
</div>`, esc(o.Domain), infra, spf, dmarc, ssl, scoreColor, score)
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:32px;background:#09090b;color:#e4e4e7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;">
  <div style="max-width:600px;margin:0 auto;">
    <div style="margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #27272a;">
      <span style="font-family:monospace;font-size:11px;letter-spacing:0.2em;color:#10b981;text-transform:uppercase;">Contact Form · cascioli.dev</span>
      <h2 style="margin:8px 0 0;color:#fafafa;font-size:20px;font-weight:600;">Nuovo messaggio da %s</h2>
    </div>
    <div style="margin-bottom:16px;">
      <span style="font-family:monospace;font-size:11px;color:#71717a;letter-spacing:0.1em;text-transform:uppercase;">Da</span>
      <p style="margin:4px 0 0;color:#a1a1aa;font-size:14px;">%s &lt;%s&gt;</p>
    </div>
    <div style="margin-bottom:24px;">
      <span style="font-family:monospace;font-size:11px;color:#71717a;letter-spacing:0.1em;text-transform:uppercase;">Messaggio</span>
      <p style="margin:8px 0 0;padding:16px;background:#18181b;border-radius:8px;border:1px solid #27272a;color:#e4e4e7;">%s</p>
    </div>
    %s
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #27272a;font-family:monospace;font-size:11px;color:#52525b;">
      cascioli.dev · architect contact form
    </div>
  </div>
</body>
</html>`, safeName, safeName, safeEmail, safeMsg, osintBox)
}

func Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	origin := r.Header.Get("Origin")
	if isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
	}
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_ = json.NewEncoder(w).Encode(contactResponse{OK: false, Message: "method not allowed"})
		return
	}

	// CSRF: require same-origin or X-Requested-With header
	if !isAllowedOrigin(origin) && r.Header.Get("X-Requested-With") != "XMLHttpRequest" {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(contactResponse{OK: false, Message: "forbidden"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 32<<10) // 32 KB max
	var req contactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(contactResponse{OK: false, Message: "invalid request body"})
		return
	}

	// Honeypot: bots fill this field, legitimate users never see it
	if strings.TrimSpace(req.HoneypotToken) != "" {
		log.Printf("[contact] honeypot triggered ip=%s", r.Header.Get("X-Forwarded-For"))
		_ = json.NewEncoder(w).Encode(contactResponse{OK: true, Message: "Message sent."})
		return
	}

	name := strings.TrimSpace(req.Name)
	email := strings.TrimSpace(req.Email)
	message := strings.TrimSpace(req.Message)

	if name == "" || email == "" || message == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(contactResponse{OK: false, Message: "name, email and message required"})
		return
	}
	if _, err := mail.ParseAddress(email); err != nil || len(email) > 254 {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(contactResponse{OK: false, Message: "invalid email address"})
		return
	}
	// Protect SMTP Subject header from CRLF injection via name field.
	if strings.ContainsAny(name, "\r\n") {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(contactResponse{OK: false, Message: "invalid characters in name"})
		return
	}
	if len(name) > 100 || len(message) > 5000 {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(contactResponse{OK: false, Message: "input exceeds allowed length"})
		return
	}

	score := computeRiskScore(req.Osint)
	subject := fmt.Sprintf("[Contact Form] Messaggio da %s", name)
	if score >= 0 {
		subject += fmt.Sprintf(" - Score: %d/100", score)
	}
	htmlBody := buildEmailHTML(name, email, message, req.Osint, score)

	apiKey := os.Getenv("RESEND_API_KEY")
	if apiKey == "" {
		log.Println("[contact] RESEND_API_KEY not configured")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(contactResponse{OK: false, Message: "server configuration error"})
		return
	}

	client := resend.NewClient(apiKey)
	params := &resend.SendEmailRequest{
		// From must be a verified sender in your Resend account.
		From:    "Contact Form <noreply@simonecascioli.it>",
		To:      []string{"info@simonecascioli.it"},
		ReplyTo: email,
		Subject: subject,
		Html:    htmlBody,
	}

	if _, err := client.Emails.Send(params); err != nil {
		log.Printf("[contact] resend error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(contactResponse{OK: false, Message: "failed to send — try emailing directly"})
		return
	}

	_ = json.NewEncoder(w).Encode(contactResponse{OK: true, Message: "Message sent."})
}
