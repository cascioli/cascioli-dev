package handler

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type MXRecord struct {
	Host string `json:"host"`
	Pref uint16 `json:"pref"`
}

type SSLInfo struct {
	Issuer string `json:"issuer"`
	Expiry string `json:"expiry"`
	Valid  bool   `json:"valid"`
}

type ScanResult struct {
	Domain           string     `json:"domain"`
	IsPublicProvider bool       `json:"is_public_provider"`
	IsDisposable     bool       `json:"is_disposable"`
	MX               []MXRecord `json:"mx"`
	SPF              *string    `json:"spf"`
	DMARC            *string    `json:"dmarc"`
	SSL              *SSLInfo   `json:"ssl"`
	Infrastructure   *string    `json:"infrastructure"`
	ArchitectScore   int        `json:"architect_score"`
	Errors           []string   `json:"errors,omitempty"`
	ScannedAt        string     `json:"scanned_at"`
}

type errorResponse struct {
	Error string `json:"error"`
}

// disposableEmailProviders is a set of known throwaway/temporary email domains.
var disposableEmailProviders = map[string]struct{}{
	"mailinator.com": {}, "guerrillamail.com": {}, "guerrillamail.net": {},
	"guerrillamail.org": {}, "guerrillamail.biz": {}, "guerrillamail.de": {},
	"guerrillamail.info": {}, "guerrillamailblock.com": {},
	"sharklasers.com": {}, "grr.la": {},
	"10minutemail.com": {}, "10minutemail.net": {}, "10minutemail.org": {},
	"20minutemail.com": {},
	"temp-mail.org": {}, "tempmail.com": {}, "tempmail.net": {},
	"tmailinator.com": {}, "tempail.com": {}, "tempr.email": {},
	"throwaway.email": {}, "throwam.com": {},
	"yopmail.com": {}, "yopmail.fr": {},
	"trashmail.com": {}, "trashmail.at": {}, "trashmail.io": {},
	"trashmail.me": {}, "trashmail.net": {},
	"maildrop.cc": {}, "discard.email": {}, "mailnull.com": {},
	"fakeinbox.com": {}, "fakeinbox.net": {}, "fakemailgenerator.com": {},
	"getnada.com": {}, "dispostable.com": {},
	"anonbox.net": {}, "spam4.me": {}, "spamgourmet.com": {},
	"mailscrap.com": {}, "mailsucker.net": {}, "spamd.de": {},
	"objectmail.com": {}, "deadaddress.com": {}, "mailbucket.org": {},
	"burnermail.io": {}, "mailtemp.info": {}, "mytemp.email": {},
	"mohmal.com": {}, "trbvm.com": {},
	"getairmail.com": {}, "filzmail.com": {}, "tempmailer.com": {},
}

func isDisposable(domain string) bool {
	_, ok := disposableEmailProviders[strings.ToLower(domain)]
	return ok
}

// publicEmailProviders is a set of well-known consumer email domains.
// Domains in this list skip heavy DNS/TLS lookups — they have no meaningful
// dedicated infrastructure to analyse from an architect's perspective.
var publicEmailProviders = map[string]struct{}{
	// Google
	"gmail.com": {}, "googlemail.com": {},
	// Microsoft
	"outlook.com": {}, "hotmail.com": {}, "hotmail.it": {}, "hotmail.fr": {},
	"hotmail.co.uk": {}, "hotmail.de": {}, "hotmail.es": {},
	"live.com": {}, "live.it": {}, "live.fr": {}, "live.co.uk": {}, "live.de": {},
	"msn.com": {},
	// Yahoo
	"yahoo.com": {}, "yahoo.it": {}, "yahoo.co.uk": {}, "yahoo.fr": {},
	"yahoo.de": {}, "yahoo.es": {}, "yahoo.co.jp": {}, "ymail.com": {},
	// Apple
	"icloud.com": {}, "me.com": {}, "mac.com": {},
	// Privacy-focused consumer
	"protonmail.com": {}, "proton.me": {}, "protonmail.ch": {},
	"tutanota.com": {}, "tutanota.de": {}, "tuta.io": {},
	// Other common consumer
	"mail.com": {}, "aol.com": {}, "gmx.com": {}, "gmx.net": {}, "gmx.de": {},
	"fastmail.com": {}, "fastmail.fm": {},
	// Italian consumer
	"libero.it": {}, "virgilio.it": {}, "tin.it": {}, "alice.it": {}, "tiscali.it": {},
	// German consumer
	"web.de": {}, "t-online.de": {}, "freenet.de": {},
}

func isPublicProvider(domain string) bool {
	_, ok := publicEmailProviders[strings.ToLower(domain)]
	return ok
}

// blockedDomains rejects localhost and private-network targets to prevent SSRF.
var blockedDomains = []string{
	"localhost", "local", "internal", "intranet", "corp", "lan",
}

// cnameProviders maps CNAME suffixes to infrastructure providers.
var cnameProviders = []struct {
	suffix   string
	provider string
}{
	{"herokudns.com", "Heroku"},
	{"v0.vercel.app", "Vercel"},
	{"vercel.app", "Vercel"},
	{"awsglobalaccelerator.com", "AWS Global Accelerator"},
	{"cloudfront.net", "AWS CloudFront"},
	{"amazonaws.com", "AWS"},
	{"netlify.app", "Netlify"},
	{"netlify.com", "Netlify"},
	{"github.io", "GitHub Pages"},
	{"pages.dev", "Cloudflare Pages"},
	{"workers.dev", "Cloudflare Workers"},
	{"fly.dev", "Fly.io"},
	{"render.com", "Render"},
	{"railway.app", "Railway"},
	{"azurewebsites.net", "Azure"},
	{"appspot.com", "Google App Engine"},
	{"fastly.net", "Fastly"},
	{"akamaized.net", "Akamai"},
}

var privateIPRanges = func() []net.IPNet {
	var ranges []net.IPNet
	for _, cidr := range []string{
		"127.0.0.0/8",   // loopback
		"10.0.0.0/8",    // RFC-1918
		"172.16.0.0/12", // RFC-1918
		"192.168.0.0/16", // RFC-1918
		"169.254.0.0/16", // link-local
		"100.64.0.0/10",  // shared address space RFC 6598
		"::1/128",        // IPv6 loopback
		"fc00::/7",       // IPv6 ULA
		"fe80::/10",      // IPv6 link-local
	} {
		_, ipNet, _ := net.ParseCIDR(cidr)
		if ipNet != nil {
			ranges = append(ranges, *ipNet)
		}
	}
	return ranges
}()

// isPrivateIP returns true for loopback, RFC-1918, link-local, and
// IPv4-mapped IPv6 addresses (::ffff:x.x.x.x) that map to any of those.
func isPrivateIP(ip net.IP) bool {
	if v4 := ip.To4(); v4 != nil {
		ip = v4
	}
	for _, r := range privateIPRanges {
		if r.Contains(ip) {
			return true
		}
	}
	return false
}

func isBlockedDomain(domain string) bool {
	d := strings.ToLower(domain)
	for _, blocked := range blockedDomains {
		if d == blocked || strings.HasSuffix(d, "."+blocked) {
			return true
		}
	}
	if net.ParseIP(d) != nil {
		return true
	}
	return false
}

func computeArchitectScore(result *ScanResult) int {
	score := 0
	// MX redundancy: up to 30 pts
	if len(result.MX) >= 2 {
		score += 30
	} else if len(result.MX) == 1 {
		score += 20
	}
	// SPF: 20 pts
	if result.SPF != nil {
		score += 20
	}
	// DMARC: 25 pts
	if result.DMARC != nil {
		score += 25
	}
	// SSL valid: 25 pts
	if result.SSL != nil && result.SSL.Valid {
		score += 25
	}
	if score > 100 {
		score = 100
	}
	return score
}

func Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	origin := r.Header.Get("Origin")
	if isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
	}
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "method not allowed"})
		return
	}

	// CSRF: require same-origin or X-Requested-With header
	if !isAllowedOrigin(r.Header.Get("Origin")) && r.Header.Get("X-Requested-With") != "XMLHttpRequest" {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "forbidden"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<10) // 1 KB — domain requests are tiny
	var body struct {
		Domain string `json:"domain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Domain) == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "missing or invalid domain"})
		return
	}

	domain := strings.ToLower(strings.TrimSpace(body.Domain))

	// Order is intentional: SSRF guard → disposable (hard block) → public provider (soft info).
	if isBlockedDomain(domain) {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "domain not allowed"})
		return
	}

	if isDisposable(domain) {
		// ArchitectScore is 0 because no scan was performed, not because the domain scored zero.
		_ = json.NewEncoder(w).Encode(ScanResult{
			Domain:       domain,
			IsDisposable: true,
			MX:           []MXRecord{},
			ScannedAt:    time.Now().UTC().Format(time.RFC3339),
		})
		return
	}

	if isPublicProvider(domain) {
		_ = json.NewEncoder(w).Encode(ScanResult{
			Domain:           domain,
			IsPublicProvider: true,
			MX:               []MXRecord{},
			ScannedAt:        time.Now().UTC().Format(time.RFC3339),
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	result := ScanResult{
		Domain:    domain,
		MX:        []MXRecord{},
		ScannedAt: time.Now().UTC().Format(time.RFC3339),
	}

	resolver := &net.Resolver{}

	var mu sync.Mutex
	var wg sync.WaitGroup

	// MX records
	wg.Add(1)
	go func() {
		defer wg.Done()
		mxRecords, err := resolver.LookupMX(ctx, domain)
		mu.Lock()
		defer mu.Unlock()
		if err != nil {
			if !isDNSNotFound(err) {
				result.Errors = append(result.Errors, "mx: "+err.Error())
			}
			return
		}
		for _, mx := range mxRecords {
			result.MX = append(result.MX, MXRecord{
				Host: strings.TrimSuffix(mx.Host, "."),
				Pref: mx.Pref,
			})
		}
	}()

	// SPF via TXT on root domain
	wg.Add(1)
	go func() {
		defer wg.Done()
		txtRecords, err := resolver.LookupTXT(ctx, domain)
		mu.Lock()
		defer mu.Unlock()
		if err != nil {
			if !isDNSNotFound(err) {
				result.Errors = append(result.Errors, "txt: "+err.Error())
			}
			return
		}
		for _, txt := range txtRecords {
			if strings.HasPrefix(strings.ToLower(txt), "v=spf1") {
				v := txt
				result.SPF = &v
				break
			}
		}
	}()

	// DMARC via _dmarc subdomain TXT
	wg.Add(1)
	go func() {
		defer wg.Done()
		dmarcRecords, err := resolver.LookupTXT(ctx, "_dmarc."+domain)
		mu.Lock()
		defer mu.Unlock()
		if err != nil {
			if !isDNSNotFound(err) {
				result.Errors = append(result.Errors, "dmarc: "+err.Error())
			}
			return
		}
		for _, txt := range dmarcRecords {
			if strings.HasPrefix(strings.ToLower(txt), "v=dmarc1") {
				v := txt
				result.DMARC = &v
				break
			}
		}
	}()

	// SSL/TLS certificate
	wg.Add(1)
	go func() {
		defer wg.Done()
		// Resolve IPs first so we can reject private ranges before dialing
		// and pin the connection to one IP to prevent DNS rebinding.
		addrs, err := resolver.LookupHost(ctx, domain)
		if err != nil || len(addrs) == 0 {
			mu.Lock()
			result.SSL = &SSLInfo{Valid: false, Issuer: "unreachable"}
			mu.Unlock()
			return
		}
		for _, addr := range addrs {
			if ip := net.ParseIP(addr); ip != nil && isPrivateIP(ip) {
				mu.Lock()
				result.SSL = &SSLInfo{Valid: false, Issuer: "blocked"}
				mu.Unlock()
				return
			}
		}
		// Dial the first resolved IP directly to avoid a second DNS lookup (rebinding).
		targetAddr := net.JoinHostPort(addrs[0], "443")
		conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 4 * time.Second}, "tcp", targetAddr, &tls.Config{
			ServerName: domain,
		})
		if err != nil {
			mu.Lock()
			result.SSL = &SSLInfo{Valid: false, Issuer: "unreachable"}
			mu.Unlock()
			return
		}
		// Read cert state before acquiring the shared mutex.
		certs := conn.ConnectionState().PeerCertificates
		conn.Close()
		mu.Lock()
		defer mu.Unlock()
		if len(certs) == 0 {
			result.SSL = &SSLInfo{Valid: false, Issuer: "no certificates"}
			return
		}
		cert := certs[0]
		org := "Unknown CA"
		if len(cert.Issuer.Organization) > 0 {
			org = cert.Issuer.Organization[0]
		}
		result.SSL = &SSLInfo{
			Issuer: org,
			Expiry: cert.NotAfter.UTC().Format("2006-01-02"),
			Valid:  cert.NotAfter.After(time.Now()),
		}
	}()

	// CNAME-based infrastructure detection
	wg.Add(1)
	go func() {
		defer wg.Done()
		cname, err := resolver.LookupCNAME(ctx, domain)
		mu.Lock()
		defer mu.Unlock()
		if err != nil || cname == "" {
			return
		}
		cname = strings.ToLower(strings.TrimSuffix(cname, "."))
		for _, p := range cnameProviders {
			if strings.HasSuffix(cname, p.suffix) {
				provider := p.provider
				result.Infrastructure = &provider
				return
			}
		}
	}()

	wg.Wait()
	result.ArchitectScore = computeArchitectScore(&result)

	_ = json.NewEncoder(w).Encode(result)
}

func isAllowedOrigin(origin string) bool {
	if origin == "https://simonecascioli.it" {
		return true
	}
	return strings.HasPrefix(origin, "http://localhost:")
}

func isDNSNotFound(err error) bool {
	if dnsErr, ok := err.(*net.DNSError); ok {
		return dnsErr.IsNotFound
	}
	return false
}
