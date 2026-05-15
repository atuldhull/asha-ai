'use client';

/**
 * ASHA-AI marketing landing.
 *
 * Visual language ported from the AyurAI "MediConsult" reference — warm
 * cream + olive + terracotta palette, Cormorant Garamond display serif,
 * botanical decorations, an AI-doctor robot figure, floating stat cards.
 * Content is fully ASHA-AI (rural triage decision support), not the
 * reference's wellness copy.
 *
 * Light/warm theme is scoped under `#asha-landing` so the dark app shell
 * (every other route) is untouched. GSAP drives entrance + scroll-reveal
 * (free plugins only — ScrollTrigger ships in the core `gsap` package;
 * DrawSVG/MorphSVG/SplitText/ScrollSmoother are Club GreenSock and were
 * intentionally not wired since they need a licensed registry token).
 */

import { useRef } from 'react';
import Link from 'next/link';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { CustomEase } from 'gsap/CustomEase';
import {
  Activity,
  BadgeCheck,
  Brain,
  ClipboardCheck,
  Clock,
  Github,
  Heart,
  Lock,
  Radio,
  ShieldCheck,
  Star,
  Stethoscope,
  WifiOff,
} from 'lucide-react';
import { useReduced } from '@/lib/reduced-motion';

// GSAP 3.15 ships every plugin fully-licensed (free since the Webflow
// acquisition). SplitText + DrawSVGPlugin were formerly Club-only.
gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin, CustomEase, useGSAP);

// Signature easing curve — a soft over-shoot used across the landing.
CustomEase.create('asha', 'M0,0 C0.22,1 0.36,1 1,1');

export default function LandingPage() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReduced();

  useGSAP(
    () => {
      if (reduced) return;

      const tl = gsap.timeline();

      // Hero headline — SplitText word-by-word reveal (premium plugin).
      const h1 = root.current?.querySelector('h1');
      let split: SplitText | null = null;
      if (h1) {
        split = new SplitText(h1, { type: 'words', wordsClass: 'lp-word' });
        tl.from(split.words, {
          yPercent: 110,
          opacity: 0,
          duration: 0.8,
          ease: 'asha',
          stagger: 0.06,
        });
      }

      // Surrounding hero copy — rise after the headline.
      tl.from(
        '.lp-anim-hero .live-badge, .lp-anim-hero .hero-sub, .lp-anim-hero .hero-desc, .lp-anim-hero .cta-row, .lp-anim-hero .trust-pills',
        {
          y: 22,
          opacity: 0,
          duration: 0.6,
          ease: 'power3.out',
          stagger: 0.08,
        },
        '-=0.45',
      );

      // Floating cards — settle in with a soft overshoot.
      tl.from(
        '.fc',
        {
          opacity: 0,
          scale: 0.88,
          duration: 0.55,
          ease: 'back.out(1.7)',
          stagger: 0.12,
        },
        '-=0.7',
      );

      // DrawSVG — trace the mandala rings + the robot's orbit halo on scroll.
      gsap.utils
        .toArray<SVGElement>('.mandala-wrap circle, .mandala-wrap path')
        .forEach((el, i) => {
          gsap.from(el, {
            scrollTrigger: { trigger: '.wellness-strip', start: 'top 80%' },
            drawSVG: '0%',
            duration: 1.1,
            ease: 'power1.inOut',
            delay: i * 0.04,
          });
        });

      // Scroll-reveal content blocks.
      gsap.utils.toArray<HTMLElement>('.lp-reveal').forEach((el) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 85%' },
          y: 28,
          opacity: 0,
          duration: 0.7,
          ease: 'asha',
        });
      });

      // Stat numbers — count-up only for simple "100%" / "3" style values.
      // Composite labels like "1 : 11,082" are left untouched.
      gsap.utils.toArray<HTMLElement>('.sbar-num').forEach((el) => {
        const raw = (el.textContent ?? '').trim();
        const m = raw.match(/^(\d+(?:\.\d+)?)(%?)$/);
        if (!m) return;
        const num = parseFloat(m[1]);
        const suffix = m[2];
        if (!Number.isFinite(num) || num === 0) return;
        const isInt = num % 1 === 0;
        const obj = { v: 0 };
        gsap.to(obj, {
          scrollTrigger: { trigger: '.stats-bar', start: 'top 85%' },
          v: num,
          duration: 1.4,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent =
              (isInt ? Math.round(obj.v) : obj.v.toFixed(1)).toString() + suffix;
          },
        });
      });

      return () => {
        split?.revert();
      };
    },
    { scope: root, dependencies: [reduced] },
  );

  return (
    <div id="asha-landing" ref={root}>
      <style>{LANDING_CSS}</style>

      {/* NAV */}
      <nav>
        <Link href="/" className="logo" aria-label="ASHA-AI home">
          <div className="logo-icon">
            <Stethoscope size={19} aria-hidden />
          </div>
          <div>
            <div className="logo-name">ASHA-AI</div>
            <div className="logo-sub">TRIAGE WHERE DOCTORS AREN&apos;T</div>
          </div>
        </Link>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#care">Care levels</a>
          <a href="#features">Capabilities</a>
          <a href="#science">The science</a>
        </div>
        <div className="nav-ctas">
          <Link href="/sign-in" className="btn-line">
            Sign in
          </Link>
          <Link href="/triage" className="btn-olive">
            Start triage →
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <div className="hero">
        <div className="hero-bg-deco" aria-hidden>
          <div className="bg-circle-1" />
          <div className="bg-circle-2" />
          <div className="bg-circle-3" />
          <div className="bg-leaf bg-leaf-1">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path
                d="M24 4 Q40 14 38 32 Q28 44 12 36 Q6 20 24 4Z"
                fill="rgba(74,90,42,0.12)"
              />
              <line x1="24" y1="4" x2="22" y2="36" stroke="rgba(74,90,42,0.2)" strokeWidth="1" />
            </svg>
          </div>
          <div className="bg-leaf bg-leaf-2">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <path
                d="M20 6 Q34 12 32 28 Q22 38 8 30 Q4 16 20 6Z"
                fill="rgba(181,99,42,0.1)"
              />
              <line x1="20" y1="6" x2="18" y2="30" stroke="rgba(181,99,42,0.18)" strokeWidth="1" />
            </svg>
          </div>
        </div>

        {/* LEFT */}
        <div className="hero-left">
          <div className="lp-anim-hero">
            <div className="live-badge">
              <div className="live-dot" />
              Decision support · not a diagnosis · works offline
            </div>
            <h1>
              Triage support,
              <br />
              where <span className="accent">doctors aren&apos;t.</span>
            </h1>
            <p className="hero-sub">AI-assisted preliminary triage, in your language.</p>
            <p className="hero-desc">
              Describe symptoms by voice, text, or a 3D body map — in Hindi, Kannada, or
              English. Get one clear next step: Home Care, Clinic Visit, or Emergency Room.
              Mapped to the ESI v5 protocol, grounded in WHO guidelines, and it runs offline
              on a ₹8,000 phone.
            </p>
            <div className="cta-row">
              <Link href="/triage" className="btn-big btn-big-pri">
                Start triage →
              </Link>
              <a href="#how" className="btn-big btn-big-sec">
                See how it works
              </a>
            </div>
            <div className="trust-pills">
              <div className="pill">
                <ShieldCheck size={14} aria-hidden /> ABDM-aligned
              </div>
              <div className="pill">
                <Lock size={14} aria-hidden /> DPDP Act 2023
              </div>
              <div className="pill">
                <Clock size={14} aria-hidden /> ESI v5 protocol
              </div>
              <div className="pill">
                <WifiOff size={14} aria-hidden /> Works offline
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="hero-right">
          {/* TOP-LEFT: sample verdict */}
          <div className="fc fc-doc">
            <div className="doc-row">
              <div className="doc-av doc-av1">
                <Stethoscope size={15} aria-hidden />
              </div>
              <div>
                <div className="doc-nm">Clinic Visit</div>
                <div className="doc-sp">ESI 3 · within 24h</div>
              </div>
            </div>
            <div className="stars" aria-hidden>
              <Star size={10} fill="currentColor" />
              <Star size={10} fill="currentColor" />
              <Star size={10} fill="currentColor" />
              <Star size={10} fill="currentColor" />
              <Star size={10} fill="currentColor" />
            </div>
            <div className="avail">
              <div className="avail-dot" /> Grounded in WHO IMCI
            </div>
          </div>

          {/* TOP-RIGHT: stat */}
          <div className="fc fc-stat">
            <div className="stat-n">0</div>
            <div className="stat-l">ER misses in eval</div>
          </div>

          {/* BOTTOM-LEFT: live cockpit */}
          <div className="fc fc-notify">
            <div className="notif-icon">
              <Radio size={16} aria-hidden />
            </div>
            <div>
              <div className="notif-text">Doctor reviewing</div>
              <div className="notif-sub">Live cockpit · realtime</div>
            </div>
          </div>

          {/* BOTTOM-RIGHT: risk score */}
          <div className="fc fc-vitals">
            <div className="vitals-icon">
              <Activity size={16} aria-hidden />
            </div>
            <div className="vitals-bpm">
              <span className="vitals-bpm-num">48</span>
              <span className="vitals-bpm-unit">/100</span>
            </div>
            <div className="vitals-lbl">Risk score</div>
          </div>

          {/* AI ROBOT DOCTOR — ported verbatim from the reference */}
          <div className="robot-figure-wrap" aria-hidden>
            <div className="scan-beam" />
            <div className="holo-particle hp1" />
            <div className="holo-particle hp2" />
            <div className="holo-particle hp3" />
            <div className="holo-particle hp4" />
            <svg viewBox="0 0 240 360" fill="none" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="coatGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#f4ede0" />
                  <stop offset="60%" stopColor="#ede2cc" />
                  <stop offset="100%" stopColor="#ddd0b4" />
                </linearGradient>
                <linearGradient id="headGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#e8dfc8" />
                  <stop offset="100%" stopColor="#d8ccb0" />
                </linearGradient>
                <radialGradient id="eyeGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#6b7f3a" />
                  <stop offset="50%" stopColor="#4a5a2a" stopOpacity=".9" />
                  <stop offset="100%" stopColor="#2e3818" stopOpacity=".6" />
                </radialGradient>
                <linearGradient id="screenGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a2410" />
                  <stop offset="100%" stopColor="#0d1508" />
                </linearGradient>
                <linearGradient id="stethoGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#9a8068" />
                  <stop offset="100%" stopColor="#6b5540" />
                </linearGradient>
                <radialGradient id="shadowGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(74,90,42,0.2)" />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>
                <filter id="glowF" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <ellipse cx="120" cy="354" rx="68" ry="8" fill="url(#shadowGrad)" />
              <rect x="89" y="278" width="27" height="72" rx="10" fill="#3a4820" />
              <rect x="123" y="278" width="27" height="72" rx="10" fill="#3a4820" />
              <ellipse cx="103" cy="350" rx="15" ry="6" fill="#2a3418" />
              <ellipse cx="136" cy="350" rx="15" ry="6" fill="#2a3418" />
              <path
                d="M62 186 Q57 222 60 278 L180 278 Q183 222 178 186 Q164 175 120 172 Q76 175 62 186Z"
                fill="url(#coatGrad)"
              />
              <path d="M120 175 L106 198 L120 213 L134 198Z" fill="#c8b898" opacity=".45" />
              <line x1="120" y1="175" x2="120" y2="278" stroke="rgba(150,130,100,.3)" strokeWidth="1.2" />
              <rect
                x="69"
                y="232"
                width="26"
                height="16"
                rx="4"
                fill="rgba(150,130,100,.18)"
                stroke="rgba(150,130,100,.28)"
                strokeWidth=".8"
              />
              <path d="M64 190 Q46 212 48 242 Q50 262 58 271 Q68 279 76 268 Q70 254 67 238 Q64 215 74 196Z" fill="url(#coatGrad)" />
              <ellipse cx="58" cy="273" rx="10" ry="7" fill="#d8ccb0" />
              <path d="M176 190 Q194 212 192 242 Q190 262 182 271 Q172 279 164 268 Q170 254 173 238 Q176 215 166 196Z" fill="url(#coatGrad)" />
              <ellipse cx="182" cy="273" rx="10" ry="7" fill="#d8ccb0" />
              <rect x="65" y="202" width="90" height="68" rx="9" fill="#1c1c1c" stroke="#4a5a2a" strokeWidth="1.2" />
              <rect x="69" y="207" width="82" height="60" rx="7" fill="url(#screenGrad)" />
              <text x="73" y="221" fontFamily="monospace" fontSize="6.5" fill="rgba(107,127,58,.65)">
                ♥ HEART RATE
              </text>
              <text x="73" y="231" fontFamily="monospace" fontSize="12" fill="#6b7f3a" fontWeight="bold">
                72 bpm
              </text>
              <polyline
                points="96,228 100,228 102,221 104,235 106,222 108,228 126,228 128,228 130,221 132,235 134,222 136,228 146,228"
                stroke="#6b7f3a"
                strokeWidth="1.2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <animate attributeName="opacity" values=".9;1;.9" dur="1.2s" repeatCount="indefinite" />
              </polyline>
              <text x="73" y="244" fontFamily="monospace" fontSize="6" fill="rgba(181,99,42,.6)">
                ⬆ BLOOD PRESSURE
              </text>
              <text x="73" y="253" fontFamily="monospace" fontSize="9.5" fill="#b5632a" fontWeight="bold">
                120/80
              </text>
              <text x="73" y="263" fontFamily="monospace" fontSize="6" fill="rgba(74,90,42,.55)">
                ◎ SpO2
              </text>
              <text x="73" y="272" fontFamily="monospace" fontSize="9.5" fill="#4a5a2a" fontWeight="bold">
                98%
              </text>
              <circle cx="110" cy="205" r="1.5" fill="#2a2a2a" />
              <path
                d="M108 174 Q100 178 94 189 Q88 202 93 215 Q97 225 105 225 Q113 225 115 215 Q117 205 113 197"
                stroke="url(#stethoGrad)"
                strokeWidth="3.2"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M132 174 Q140 178 146 189 Q152 202 147 215 Q143 225 135 225 Q127 225 125 215 Q123 205 127 197"
                stroke="url(#stethoGrad)"
                strokeWidth="3.2"
                strokeLinecap="round"
                fill="none"
              />
              <path d="M108 174 Q120 169 132 174" stroke="url(#stethoGrad)" strokeWidth="2.8" fill="none" strokeLinecap="round" />
              <circle cx="120" cy="197" r="7.5" fill="none" stroke="#9a8068" strokeWidth="2" />
              <circle cx="120" cy="197" r="3.8" fill="rgba(154,128,104,.4)" />
              <circle cx="120" cy="197" r="2" fill="#9a8068">
                <animate attributeName="opacity" values="1;.4;1" dur="1.4s" repeatCount="indefinite" />
              </circle>
              <path d="M105 225 Q113 233 120 229 Q127 225 135 225" stroke="#9a8068" strokeWidth="2.2" fill="none" strokeLinecap="round" />
              <line x1="120" y1="229" x2="120" y2="197" stroke="#9a8068" strokeWidth="1.8" />
              <rect x="111" y="149" width="18" height="25" rx="6" fill="#c8c0a8" />
              <rect x="82" y="90" width="76" height="68" rx="26" fill="url(#headGrad)" />
              <ellipse cx="107" cy="100" rx="17" ry="9" fill="rgba(255,255,255,.18)" />
              <ellipse cx="82" cy="124" rx="8" ry="12" fill="#c8c0a8" />
              <ellipse cx="82" cy="124" rx="4.5" ry="7.5" fill="#b8b0a0" />
              <ellipse cx="158" cy="124" rx="8" ry="12" fill="#c8c0a8" />
              <ellipse cx="158" cy="124" rx="4.5" ry="7.5" fill="#b8b0a0" />
              <circle cx="104" cy="118" r="13" fill="#18180e" />
              <circle cx="136" cy="118" r="13" fill="#18180e" />
              <circle cx="104" cy="118" r="8" fill="url(#eyeGlow)" filter="url(#glowF)">
                <animate attributeName="r" values="8;9;8" dur="2.6s" repeatCount="indefinite" />
              </circle>
              <circle cx="136" cy="118" r="8" fill="url(#eyeGlow)" filter="url(#glowF)">
                <animate attributeName="r" values="8;9;8" dur="2.6s" repeatCount="indefinite" begin=".35s" />
              </circle>
              <circle cx="104" cy="118" r="3.5" fill="#060804" />
              <circle cx="136" cy="118" r="3.5" fill="#060804" />
              <circle cx="107" cy="115" r="2.2" fill="rgba(180,210,140,.6)" />
              <circle cx="139" cy="115" r="2.2" fill="rgba(180,210,140,.6)" />
              <rect x="109" y="140" width="22" height="7" rx="3.5" fill="#141408" />
              <rect x="116" y="84" width="8" height="9" rx="2.5" fill="#b8b0a0" />
              <rect x="119" y="70" width="2.5" height="16" rx="1.2" fill="#a8a090" />
              <circle cx="120" cy="67" r="4.5" fill="rgba(74,90,42,.15)">
                <animate attributeName="r" values="4.5;7.5;4.5" dur="1.6s" repeatCount="indefinite" />
              </circle>
              <circle cx="120" cy="67" r="3" fill="#6b7f3a">
                <animate attributeName="r" values="3;4;3" dur="1.6s" repeatCount="indefinite" />
              </circle>
              <ellipse
                cx="120"
                cy="115"
                rx="46"
                ry="11"
                fill="none"
                stroke="rgba(74,90,42,.18)"
                strokeWidth=".9"
                strokeDasharray="4,3"
              >
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 120 115"
                  to="360 120 115"
                  dur="9s"
                  repeatCount="indefinite"
                />
              </ellipse>
            </svg>
          </div>
        </div>
      </div>

      {/* STATS BAR */}
      <div className="stats-bar lp-reveal">
        <div className="sbar-item">
          <div className="sbar-num">100%</div>
          <div className="sbar-label">Emergency recall in 53-case eval</div>
        </div>
        <div className="sbar-item">
          <div className="sbar-num">1 : 11,082</div>
          <div className="sbar-label">India rural doctor-to-patient ratio</div>
        </div>
        <div className="sbar-item">
          <div className="sbar-num">3</div>
          <div className="sbar-label">Languages — Hindi · Kannada · English</div>
        </div>
      </div>

      {/* FEATURES */}
      <div className="features" id="features">
        <div className="feat-grid">
          <Link href="/triage" className="feat lp-reveal">
            <div className="feat-ic fi1">
              <Stethoscope size={20} aria-hidden />
            </div>
            <div className="feat-t">Instant triage</div>
            <div className="feat-d">
              Voice, text, or a tap-the-body 3D map — a clear next step in seconds, day or night.
            </div>
          </Link>
          <Link href="/triage" className="feat lp-reveal">
            <div className="feat-ic fi2">
              <Brain size={20} aria-hidden />
            </div>
            <div className="feat-t">AI symptom extraction</div>
            <div className="feat-d">
              An LLM reads your words; 9 deterministic red-flag rules guarantee emergencies escalate.
            </div>
          </Link>
          <Link href="/triage" className="feat lp-reveal" id="care">
            <div className="feat-ic fi3">
              <ClipboardCheck size={20} aria-hidden />
            </div>
            <div className="feat-t">A clear verdict</div>
            <div className="feat-d">
              Home Care · Clinic Visit · Emergency Room — mapped to the ESI v5 acuity protocol.
            </div>
          </Link>
          <Link href="/triage/body-map-3d" className="feat lp-reveal">
            <div className="feat-ic fi4">
              <WifiOff size={20} aria-hidden />
            </div>
            <div className="feat-t">Works offline</div>
            <div className="feat-d">
              Edge mode runs on a ₹8,000 phone with no internet — the rural last mile, covered.
            </div>
          </Link>
        </div>
      </div>

      {/* HOW IT WORKS / SCIENCE STRIP */}
      <div className="wellness-strip" id="how">
        <div className="ws-left lp-reveal">
          <div className="ws-label" id="science">
            India Telemedicine Practice Guidelines 2020
          </div>
          <div className="ws-title">
            Care that reaches
            <br />
            the last mile
          </div>
          <div className="ws-desc">
            Built for ASHA workers and patients where the nearest doctor is hours away.
            Decision support — never a diagnosis or a prescription. Grounded in WHO IMCI
            and India MoHFW standard treatment guidelines, validated against a 53-case
            gold-standard eval with zero missed emergencies.
          </div>
          <div className="deco-pill-row">
            <div className="deco-pill">
              <Activity size={14} aria-hidden /> Voice-first
            </div>
            <div className="deco-pill">
              <WifiOff size={14} aria-hidden /> Offline-ready
            </div>
            <div className="deco-pill">
              <Heart size={14} aria-hidden /> Multilingual
            </div>
          </div>
          <br />
          <Link href="/triage" className="ws-cta">
            Start triage now
            <div className="ws-cta-arrow">→</div>
          </Link>
        </div>
        <div className="ws-right" aria-hidden>
          <div className="herb-deco" style={{ top: 20, left: 30 }}>
            <svg width="70" height="90" viewBox="0 0 70 90" fill="none">
              <path d="M35 80 L35 30" stroke="rgba(74,90,42,1)" strokeWidth="2" strokeLinecap="round" />
              <path d="M35 55 C35 55 20 46 18 34 C18 34 28 28 38 40 C38 40 38 50 35 55Z" fill="rgba(74,90,42,0.8)" />
              <path d="M35 42 C35 42 48 34 50 22 C50 22 40 16 30 28 C30 28 32 38 35 42Z" fill="rgba(106,127,58,0.6)" />
              <path d="M35 68 C35 68 24 60 22 50 C22 50 30 46 38 56 C38 56 37 64 35 68Z" fill="rgba(74,90,42,0.5)" />
            </svg>
          </div>
          <div className="herb-deco" style={{ bottom: 20, right: 40 }}>
            <svg width="60" height="80" viewBox="0 0 60 80" fill="none">
              <path d="M30 72 L30 28" stroke="rgba(181,99,42,0.9)" strokeWidth="2" strokeLinecap="round" />
              <path d="M30 50 C30 50 16 42 14 30 C14 30 24 24 34 36 C34 36 34 46 30 50Z" fill="rgba(181,99,42,0.7)" />
              <path d="M30 36 C30 36 42 28 44 18 C44 18 34 12 26 24 C26 24 28 32 30 36Z" fill="rgba(212,135,78,0.5)" />
            </svg>
          </div>
          <div className="mandala-wrap">
            <svg viewBox="0 0 200 200">
              <g className="m-ring1">
                <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(74,90,42,0.2)" strokeWidth="1" strokeDasharray="8,6" />
                <circle cx="100" cy="10" r="5" fill="rgba(74,90,42,0.35)" />
                <circle cx="100" cy="190" r="5" fill="rgba(74,90,42,0.35)" />
                <circle cx="10" cy="100" r="5" fill="rgba(74,90,42,0.35)" />
                <circle cx="190" cy="100" r="5" fill="rgba(74,90,42,0.35)" />
              </g>
              <g className="m-ring2">
                <circle cx="100" cy="100" r="64" fill="none" stroke="rgba(181,99,42,0.25)" strokeWidth="1.2" strokeDasharray="5,4" />
                <circle cx="100" cy="36" r="4" fill="rgba(181,99,42,0.4)" />
                <circle cx="100" cy="164" r="4" fill="rgba(181,99,42,0.4)" />
                <circle cx="36" cy="100" r="4" fill="rgba(181,99,42,0.4)" />
                <circle cx="164" cy="100" r="4" fill="rgba(181,99,42,0.4)" />
              </g>
              <g className="m-ring3">
                <circle cx="100" cy="100" r="38" fill="none" stroke="rgba(74,90,42,0.35)" strokeWidth="1.5" strokeDasharray="3,3" />
                <path d="M100 62 L106 88 L100 95 L94 88Z" fill="rgba(74,90,42,0.3)" />
                <path d="M100 138 L106 112 L100 105 L94 112Z" fill="rgba(74,90,42,0.3)" />
                <path d="M62 100 L88 106 L95 100 L88 94Z" fill="rgba(74,90,42,0.3)" />
                <path d="M138 100 L112 106 L105 100 L112 94Z" fill="rgba(74,90,42,0.3)" />
              </g>
              <circle cx="100" cy="100" r="14" fill="rgba(74,90,42,0.15)" stroke="rgba(74,90,42,0.4)" strokeWidth="1.5" />
              <circle cx="100" cy="100" r="6" fill="rgba(181,99,42,0.5)" />
              <circle cx="100" cy="100" r="22" fill="none" stroke="rgba(74,90,42,0.15)" strokeWidth="8">
                <animate attributeName="r" values="14;28;14" dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0;0.4" dur="3s" repeatCount="indefinite" />
              </circle>
            </svg>
          </div>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div className="bottom-bar">
        <div className="social-row">
          <span className="sl">Open source · MIT</span>
          <a
            className="sico"
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
          >
            <Github size={14} aria-hidden />
          </a>
          <Link className="sico" href="/settings/privacy" aria-label="Privacy & data">
            <Lock size={14} aria-hidden />
          </Link>
          <Link className="sico" href="/sign-in" aria-label="Sign in">
            <BadgeCheck size={14} aria-hidden />
          </Link>
        </div>
        <div className="tagline">
          Decision support, not a diagnosis. In an emergency, dial 108.
        </div>
      </div>
    </div>
  );
}

/* AyurAI palette + layout, scoped under #asha-landing so the dark app
   shell on every other route is untouched. */
const LANDING_CSS = `
#asha-landing{
  --cream:#f9f5ec; --cream2:#f2ead8; --cream3:#e8ddc4;
  --olive:#4a5a2a; --olive2:#6b7f3a; --olive4:#eef4dc;
  --terra:#b5632a; --terra2:#d4874e; --terra3:#f5e4d4; --terra4:#fdf0e8;
  --bark:#2e2218; --bark2:#5a4430; --bark3:#9a8068;
  --white:#ffffff;
  background:var(--cream);
  color:var(--bark);
  font-family:var(--font-dm),'DM Sans',system-ui,sans-serif;
  display:flex;flex-direction:column;min-height:100vh;
}
#asha-landing a{color:inherit;text-decoration:none}
@keyframes lpFadeIn{from{opacity:0}to{opacity:1}}
@keyframes lpFloatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
@keyframes lpPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}
@keyframes lpRipple{0%{transform:scale(.6);opacity:.7}100%{transform:scale(2.2);opacity:0}}
@keyframes lpLeaf{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}
@keyframes lpHeart{0%,100%{transform:scale(1)}14%{transform:scale(1.18)}28%{transform:scale(1)}42%{transform:scale(1.12)}70%{transform:scale(1)}}
@keyframes lpRotS{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes lpRotR{from{transform:rotate(0)}to{transform:rotate(-360deg)}}
@keyframes lpScan{0%{transform:translateY(0);opacity:.7}100%{transform:translateY(430px);opacity:0}}
@keyframes lpParticle{0%{transform:translateY(0) scale(1);opacity:.8}100%{transform:translateY(-18px) scale(.5);opacity:0}}

#asha-landing nav{display:flex;align-items:center;justify-content:space-between;padding:14px 40px;background:var(--white);border-bottom:.5px solid rgba(46,34,24,.09);animation:lpFadeIn .6s ease both}
#asha-landing .logo{display:flex;align-items:center;gap:11px}
#asha-landing .logo-icon{width:40px;height:40px;background:var(--olive);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;animation:lpHeart 2.4s ease-in-out infinite}
#asha-landing .logo-name{font-family:var(--font-display),'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:var(--bark)}
#asha-landing .logo-sub{font-size:9px;color:var(--bark3);letter-spacing:.7px;margin-top:1px}
#asha-landing .nav-links{display:flex;gap:28px}
#asha-landing .nav-links a{font-size:13px;color:var(--bark2);cursor:pointer;position:relative;padding-bottom:2px;transition:color .2s}
#asha-landing .nav-links a::after{content:'';position:absolute;bottom:0;left:0;width:0;height:1.5px;background:var(--olive);transition:width .25s}
#asha-landing .nav-links a:hover{color:var(--olive)}
#asha-landing .nav-links a:hover::after{width:100%}
#asha-landing .nav-ctas{display:flex;gap:10px}
#asha-landing .btn-olive{background:var(--olive);color:#fff;border:none;padding:9px 22px;border-radius:9px;font-size:13px;font-weight:500;cursor:pointer;transition:transform .18s,opacity .18s}
#asha-landing .btn-olive:hover{transform:translateY(-1px);opacity:.9}
#asha-landing .btn-line{background:transparent;color:var(--olive);border:1.5px solid var(--olive);padding:9px 20px;border-radius:9px;font-size:13px;cursor:pointer;transition:background .2s,transform .18s}
#asha-landing .btn-line:hover{background:var(--olive4);transform:translateY(-1px)}

#asha-landing .hero{display:grid;grid-template-columns:1fr 480px;min-height:580px;position:relative;overflow:hidden;background:linear-gradient(135deg,#fdf8f0 0%,#f7efe0 40%,#f2e8d4 100%)}
#asha-landing .hero-bg-deco{position:absolute;inset:0;pointer-events:none;overflow:hidden}
#asha-landing .bg-circle-1{position:absolute;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(181,99,42,.09) 0%,transparent 65%);right:-60px;top:-80px}
#asha-landing .bg-circle-2{position:absolute;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(74,90,42,.08) 0%,transparent 70%);left:28%;bottom:20px}
#asha-landing .bg-circle-3{position:absolute;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(181,99,42,.07) 0%,transparent 70%);left:10%;top:60px}
#asha-landing .bg-leaf{position:absolute;pointer-events:none}
#asha-landing .bg-leaf svg{animation:lpLeaf 4s ease-in-out infinite}
#asha-landing .bg-leaf-1{left:42%;top:20px}
#asha-landing .bg-leaf-2{left:55%;bottom:30px}
#asha-landing .hero-left{padding:56px 52px 44px;display:flex;flex-direction:column;justify-content:center;position:relative;z-index:2}
#asha-landing .hero-left::before{content:'';position:absolute;left:0;top:0;width:3px;height:100%;background:linear-gradient(180deg,transparent 10%,var(--terra2) 40%,var(--olive2) 80%,transparent 100%);opacity:.5;border-radius:2px}
#asha-landing .live-badge{display:inline-flex;align-items:center;gap:7px;background:rgba(181,99,42,.1);color:var(--terra);border-radius:30px;padding:6px 16px;font-size:12px;font-weight:500;margin-bottom:24px;width:fit-content;border:.5px solid rgba(181,99,42,.3)}
#asha-landing .live-dot{width:7px;height:7px;background:var(--terra2);border-radius:50%;animation:lpPulse 1.8s ease-in-out infinite;position:relative}
#asha-landing .live-dot::after{content:'';position:absolute;inset:-3px;border-radius:50%;border:1.5px solid var(--terra2);animation:lpRipple 1.8s ease-out infinite}
#asha-landing h1{font-family:var(--font-display),'Cormorant Garamond',serif;font-size:60px;line-height:1.05;color:var(--bark);margin-bottom:8px;font-weight:700}
#asha-landing h1 .accent{color:var(--olive);font-style:italic}
#asha-landing .hero-sub{font-family:var(--font-display),'Cormorant Garamond',serif;font-size:20px;color:var(--bark3);margin-bottom:18px;font-style:italic}
#asha-landing .hero-desc{font-size:14px;color:var(--bark2);line-height:1.8;max-width:430px;margin-bottom:32px}
#asha-landing .cta-row{display:flex;gap:12px;margin-bottom:32px;flex-wrap:wrap}
#asha-landing .btn-big{padding:15px 30px;border-radius:12px;font-size:14px;font-weight:500;cursor:pointer;transition:transform .2s,box-shadow .2s;border:none;display:inline-flex;align-items:center}
#asha-landing .btn-big-pri{background:linear-gradient(135deg,var(--terra) 0%,var(--terra2) 100%);color:#fff;box-shadow:0 4px 18px rgba(181,99,42,.3)}
#asha-landing .btn-big-pri:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(181,99,42,.4)}
#asha-landing .btn-big-sec{background:var(--white);color:var(--bark);border:1.5px solid rgba(46,34,24,.18)}
#asha-landing .btn-big-sec:hover{background:var(--cream2);transform:translateY(-1px)}
#asha-landing .trust-pills{display:flex;flex-wrap:wrap;gap:10px}
#asha-landing .pill{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.8);border:.5px solid rgba(46,34,24,.12);border-radius:30px;padding:6px 14px;font-size:12px;color:var(--bark2)}
#asha-landing .pill svg{color:var(--terra)}

#asha-landing .hero-right{background:linear-gradient(150deg,#f0e8d0 0%,#e8dcc0 30%,#f0e0cc 70%,#ead4b8 100%);position:relative;overflow:hidden;display:flex;align-items:flex-end;justify-content:center;min-height:580px}
#asha-landing .fc{position:absolute;background:rgba(255,255,255,.96);border-radius:14px;border:.5px solid rgba(46,34,24,.1);padding:12px 15px;box-shadow:0 6px 28px rgba(46,34,24,.09);backdrop-filter:blur(10px);z-index:4}
#asha-landing .fc-doc{top:28px;left:22px;min-width:172px;max-width:172px}
#asha-landing .doc-row{display:flex;align-items:center;gap:9px;margin-bottom:8px}
#asha-landing .doc-av{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
#asha-landing .doc-av1{background:var(--terra3);color:var(--terra)}
#asha-landing .doc-nm{font-size:12px;font-weight:600;color:var(--bark);line-height:1.2}
#asha-landing .doc-sp{font-size:10px;color:var(--bark3);margin-top:1px}
#asha-landing .stars{display:flex;gap:1px;margin-bottom:3px;color:var(--terra)}
#asha-landing .avail{font-size:10px;color:var(--olive);font-weight:500;display:flex;align-items:center;gap:4px}
#asha-landing .avail-dot{width:5px;height:5px;border-radius:50%;background:var(--olive2);animation:lpPulse 2s ease-in-out infinite;flex-shrink:0}
#asha-landing .fc-stat{top:28px;right:22px;text-align:center;min-width:90px}
#asha-landing .stat-n{font-family:var(--font-display),'Cormorant Garamond',serif;font-size:26px;color:var(--terra);line-height:1;font-weight:700}
#asha-landing .stat-l{font-size:10px;color:var(--bark3);margin-top:2px}
#asha-landing .fc-notify{bottom:34px;left:22px;display:flex;align-items:center;gap:9px;min-width:168px;max-width:168px}
#asha-landing .notif-icon{width:32px;height:32px;background:var(--olive4);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--olive);flex-shrink:0}
#asha-landing .notif-text{font-size:11px;color:var(--bark);font-weight:600}
#asha-landing .notif-sub{font-size:10px;color:var(--bark3);margin-top:1px}
#asha-landing .fc-vitals{bottom:34px;right:22px;text-align:center;min-width:86px}
#asha-landing .vitals-icon{color:var(--terra);margin-bottom:3px;display:flex;justify-content:center}
#asha-landing .vitals-bpm{display:flex;align-items:baseline;gap:3px;justify-content:center}
#asha-landing .vitals-bpm-num{font-family:var(--font-display),'Cormorant Garamond',serif;font-size:26px;color:var(--terra);font-weight:700;line-height:1}
#asha-landing .vitals-bpm-unit{font-size:10px;color:var(--bark3)}
#asha-landing .vitals-lbl{font-size:10px;color:var(--bark3);margin-top:2px}
#asha-landing .robot-figure-wrap{position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:300px;height:460px;z-index:3;animation:lpFloatY 5s ease-in-out infinite;filter:drop-shadow(0 24px 48px rgba(74,90,42,.18))}
#asha-landing .scan-beam{position:absolute;top:0;left:0;width:100%;height:4px;background:linear-gradient(90deg,transparent,rgba(74,90,42,.5),rgba(107,127,58,.6),rgba(74,90,42,.5),transparent);animation:lpScan 2.8s ease-in-out infinite;pointer-events:none;z-index:10;border-radius:2px}
#asha-landing .holo-particle{position:absolute;width:5px;height:5px;border-radius:50%;background:rgba(74,90,42,.55);animation:lpParticle 2.5s ease-out infinite;pointer-events:none}
#asha-landing .hp1{bottom:80px;left:30px}
#asha-landing .hp2{bottom:100px;right:28px;animation-delay:.7s;background:rgba(181,99,42,.4)}
#asha-landing .hp3{bottom:130px;left:20px;animation-delay:1.4s;width:3px;height:3px}
#asha-landing .hp4{bottom:60px;right:20px;animation-delay:.3s;width:3px;height:3px;background:rgba(181,99,42,.35)}

#asha-landing .stats-bar{display:grid;grid-template-columns:repeat(3,1fr);background:linear-gradient(135deg,var(--bark) 0%,#3d2a18 50%,#2e2218 100%)}
#asha-landing .sbar-item{padding:22px 28px;border-right:.5px solid rgba(255,255,255,.15);text-align:center}
#asha-landing .sbar-item:last-child{border-right:none}
#asha-landing .sbar-num{font-family:var(--font-display),'Cormorant Garamond',serif;font-size:30px;color:var(--terra2);font-weight:700}
#asha-landing .sbar-label{font-size:11px;color:rgba(255,255,255,.72);margin-top:3px;letter-spacing:.4px}

#asha-landing .features{background:var(--white);border-top:.5px solid rgba(46,34,24,.07)}
#asha-landing .feat-grid{display:grid;grid-template-columns:repeat(4,1fr)}
#asha-landing .feat{padding:24px 20px;border-right:.5px solid rgba(46,34,24,.07);cursor:pointer;transition:background .2s,transform .2s;display:block}
#asha-landing .feat:last-child{border-right:none}
#asha-landing .feat:hover{background:var(--cream);transform:translateY(-2px)}
#asha-landing .feat-ic{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:12px}
#asha-landing .fi1,#asha-landing .fi3{background:var(--olive4);color:var(--olive)}
#asha-landing .fi2,#asha-landing .fi4{background:var(--terra3);color:var(--terra)}
#asha-landing .feat-t{font-size:13px;font-weight:600;color:var(--bark);margin-bottom:4px}
#asha-landing .feat-d{font-size:11px;color:var(--bark3);line-height:1.55}

#asha-landing .wellness-strip{display:grid;grid-template-columns:1fr 1fr;background:var(--cream2);border-top:.5px solid rgba(46,34,24,.07);min-height:240px;overflow:hidden;position:relative}
#asha-landing .ws-left{padding:40px 44px;display:flex;flex-direction:column;justify-content:center}
#asha-landing .ws-label{font-size:11px;color:var(--olive2);letter-spacing:1.2px;text-transform:uppercase;margin-bottom:10px;font-weight:500}
#asha-landing .ws-title{font-family:var(--font-display),'Cormorant Garamond',serif;font-size:34px;color:var(--bark);line-height:1.2;margin-bottom:12px}
#asha-landing .ws-desc{font-size:13px;color:var(--bark2);line-height:1.7;max-width:380px;margin-bottom:18px}
#asha-landing .ws-cta{display:inline-flex;align-items:center;gap:10px;background:var(--bark);color:#fff;border:none;border-radius:40px;padding:12px 26px;font-size:13px;font-weight:500;cursor:pointer;transition:transform .2s,opacity .2s;width:fit-content}
#asha-landing .ws-cta:hover{transform:translateY(-2px);opacity:.9}
#asha-landing .ws-cta-arrow{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center}
#asha-landing .ws-right{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}
#asha-landing .mandala-wrap{position:relative;width:200px;height:200px}
#asha-landing .mandala-wrap svg{position:absolute;top:0;left:0;width:100%;height:100%}
#asha-landing .m-ring1{animation:lpRotS 20s linear infinite;transform-origin:center}
#asha-landing .m-ring2{animation:lpRotR 14s linear infinite;transform-origin:center}
#asha-landing .m-ring3{animation:lpRotS 10s linear infinite;transform-origin:center}
#asha-landing .deco-pill-row{display:flex;gap:10px;flex-wrap:wrap}
#asha-landing .deco-pill{display:flex;align-items:center;gap:6px;background:var(--white);border:.5px solid rgba(46,34,24,.1);border-radius:30px;padding:5px 12px;font-size:11px;color:var(--bark2)}
#asha-landing .deco-pill svg{color:var(--olive2)}
#asha-landing .herb-deco{position:absolute;pointer-events:none;opacity:.18}

#asha-landing .bottom-bar{display:flex;align-items:center;justify-content:space-between;padding:14px 40px;background:var(--cream);border-top:.5px solid rgba(46,34,24,.08)}
#asha-landing .social-row{display:flex;align-items:center;gap:10px}
#asha-landing .sl{font-size:12px;color:var(--bark3);margin-right:4px}
#asha-landing .sico{width:32px;height:32px;border-radius:50%;border:.5px solid rgba(46,34,24,.14);display:flex;align-items:center;justify-content:center;color:var(--bark2);cursor:pointer;background:transparent;transition:background .18s,transform .18s}
#asha-landing .sico:hover{background:var(--cream2);transform:scale(1.1)}
#asha-landing .tagline{font-size:14px;color:var(--bark3);font-style:italic;font-family:var(--font-display),'Cormorant Garamond',serif}

@media (max-width:900px){
  #asha-landing .hero{grid-template-columns:1fr}
  #asha-landing .hero-right{min-height:420px}
  #asha-landing .hero-left{padding:40px 28px}
  #asha-landing h1{font-size:44px}
  #asha-landing .feat-grid{grid-template-columns:repeat(2,1fr)}
  #asha-landing .wellness-strip{grid-template-columns:1fr}
  #asha-landing .ws-right{min-height:200px}
  #asha-landing nav{padding:12px 20px}
  #asha-landing .nav-links{display:none}
  #asha-landing .stats-bar{grid-template-columns:1fr}
  #asha-landing .sbar-item{border-right:none;border-bottom:.5px solid rgba(255,255,255,.15)}
}
@media (prefers-reduced-motion:reduce){
  #asha-landing *{animation:none!important}
}
`;
