// The canonical MAYA chat screen.
//
// Ported from the owner's app.html:21176-22335 — the presentation tail of AChat. Every number is
// quoted from that source; nothing here is designed. The 4 504-line logic head above it (the legacy
// salon relay, MAYA OS onboarding, CRM connect, email OTP, payments) is NOT carried: those are
// legacy product screens that happened to live inside the same function.
//
// The composition is what was lost, and it is layering rather than colour. ONE fixed container
// holds a transparent floating header (absolute, top) and an absolutely-positioned footer
// (absolute, bottom, zIndex 5) that both OVERLAP a single full-bleed scroller. The scroller
// reserves room for both with its own padding — 84px at the top, 212px at the bottom — so messages
// pass under the header and behind the composer, and a gradient scrim softens the lower edge. The
// current minimal shell is a three-row document flow in which nothing floats, which is why it reads
// as a different product even where the colours agree.

import { Backdrop } from '../identity/Backdrop.tsx';
import { MayaMark, MayaVolumeMark } from '../identity/MayaMark.tsx';
import { MayaTypewriterText } from '../identity/MayaTypewriterText.tsx';
import { MAYA_ACCENT, MAYA_ACCENT_ON, type Tokens } from '../identity/tokens.ts';

/** The reading face MAYA's own words are set in (app.html:21307). */
const READING = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
/**
 * The chrome face. Canonically `DISPLAY` and `BODY` are BOTH "'Montserrat', sans-serif"
 * (app.html:1954-1955), served locally from fonts.css. Montserrat is NOT shipped here: the carrier
 * may load no external resource, and the owner deferred the ~820 KB payload as its own decision.
 * The stack therefore falls through to the platform face — the tracking and sizes below are the
 * owner's, the letterforms are not. This is the one knowingly unfaithful value on the screen.
 */
const DISPLAY = READING;

export interface ChatMessage {
  readonly role: 'user' | 'bot';
  readonly text: string;
  /** Reveal this turn with the typewriter, as the canonical chat does for MAYA's words. */
  readonly typewriter?: boolean;
}

/** app.html:21254 — the thinking state, docked above the composer, never inside the lane. */
function TypingDots({ dark }: { readonly dark: boolean }) {
  return (
    <div
      className={'maya-typing' + (dark ? '' : ' maya-typing-light')}
      role="status"
      aria-label="Maya печатает"
      style={{ padding: '4px 2px' }}
    >
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </div>
  );
}

export function ChatScreen({
  t,
  messages,
  draft,
  thinking = false,
  role = 'Администратор',
  status = 'онлайн',
}: {
  readonly t: Tokens;
  readonly messages: readonly ChatMessage[];
  readonly draft: string;
  readonly thinking?: boolean;
  readonly role?: string;
  readonly status?: string;
}) {
  const dark = t.dark;
  const hasDraft = draft.trim().length > 0;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: t.bg }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Backdrop t={t} />
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* app.html:21510-21522 — the header floats and is transparent; the lane scrolls UNDER it. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 18px 16px',
            background: 'transparent',
            pointerEvents: 'none',
          }}
        >
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            {/*
              app.html:21523-21541. Mark, name and status are collected into ONE floating pill so
              that, as the lane scrolls, they do not read as part of the first message. The pill is
              filled with the brand blue in BOTH themes — so the glass edge and the inner highlight
              were removed: they belonged to the light glass and read as a foreign frame on a fill.
            */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 16px 8px 14px',
                borderRadius: 999,
                minWidth: 0,
                maxWidth: '100%',
                background: MAYA_ACCENT,
                border: '0',
                boxShadow: '0 8px 22px rgba(10,132,255,.38)',
              }}
            >
              <div
                aria-hidden="true"
                style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: MAYA_ACCENT_ON }}
              >
                <MayaMark size={20} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 500,
                    fontSize: 12.5,
                    letterSpacing: '0.06em',
                    whiteSpace: 'nowrap',
                    color: MAYA_ACCENT_ON,
                  }}
                >
                  Maya
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span
                    className="maya-status-dot"
                    style={{ width: 5, height: 5, flex: '0 0 5px', borderRadius: 999, background: 'rgba(255,255,255,.8)' }}
                  />
                  <span
                    style={{
                      fontFamily: DISPLAY,
                      fontSize: 9,
                      letterSpacing: '.16em',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: 'rgba(255,255,255,.8)',
                    }}
                  >
                    {role} · {status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* app.html:21647-21658 — the one scroller. 84px clears the header, 212px the composer. */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            padding: 'calc(env(safe-area-inset-top, 0px) + 84px) 18px calc(env(safe-area-inset-bottom, 0px) + 212px)',
          }}
        >
          {messages.map((m, i) => {
            const user = m.role === 'user';
            return (
              <div
                key={i}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: user ? 'flex-end' : 'flex-start',
                  gap: 7,
                  marginBottom: 14,
                  minWidth: 0,
                }}
              >
                <div
                  data-chat-message={user ? 'user' : 'maya'}
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    width: user ? 'fit-content' : '100%',
                    maxWidth: user ? '78%' : '100%',
                    minWidth: 0,
                    flex: user ? '0 1 auto' : '1 1 100%',
                    transformOrigin: user ? 'right center' : 'left center',
                  }}
                >
                  {/*
                    The asymmetry that IS the design: only the person speaks inside a container.
                    MAYA's words are the page itself — no background, no border, no radius, no
                    padding. Giving MAYA a bubble turns a conversation into a support ticket.
                  */}
                  <div
                    style={{
                      width: '100%',
                      minWidth: 0,
                      boxSizing: 'border-box',
                      borderRadius: user ? 20 : 0,
                      padding: user ? '10px 15px' : 0,
                      background: user ? (dark ? '#2A2A2C' : '#ECEAE5') : 'transparent',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: user ? DISPLAY : READING,
                        fontSize: user ? 15 : 17,
                        lineHeight: user ? '22px' : '25px',
                        letterSpacing: user ? 0 : '-0.01em',
                        fontWeight: 400,
                        color: dark ? '#F4F0EB' : '#0B0B0C',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {!user && m.typewriter ? <MayaTypewriterText text={m.text} /> : m.text}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* app.html:21759-21762 — the footer overlays the lane; only the pill takes pointer events. */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 5,
            display: 'flex',
            flexDirection: 'column',
            pointerEvents: 'none',
          }}
        >
          {thinking ? (
            <div
              data-maya-thinking-dock="true"
              style={{
                position: 'relative',
                zIndex: 3,
                width: '100%',
                minHeight: 24,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                padding: '0 20px 3px',
                pointerEvents: 'none',
              }}
            >
              <TypingDots dark={dark} />
            </div>
          ) : null}

          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 8,
              position: 'relative',
              padding: '8px 14px calc(74px + env(safe-area-inset-bottom, 0px))',
              background: 'transparent',
              pointerEvents: 'auto',
            }}
          >
            {/* app.html:21806-21823 — the soft ground, so messages under the bar do not compete with it. */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                top: -40,
                pointerEvents: 'none',
                zIndex: 0,
                background: dark
                  ? 'linear-gradient(to top, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.88) 38%, rgba(0,0,0,0.45) 68%, rgba(0,0,0,0) 100%)'
                  : 'linear-gradient(to top, rgba(244,240,235,0.99) 0%, rgba(244,240,235,0.92) 38%, rgba(244,240,235,0.5) 68%, rgba(244,240,235,0) 100%)',
              }}
            />

            <div style={{ position: 'relative', zIndex: 1, width: '100%', height: 52 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  height: '100%',
                  minHeight: 52,
                  borderRadius: 26,
                  boxSizing: 'border-box',
                  background: dark ? 'rgba(18,18,20,0.98)' : 'rgba(252,249,244,0.98)',
                  border: '1px solid ' + (dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'),
                  boxShadow: dark
                    ? '0 12px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)'
                    : '0 12px 28px rgba(24,22,15,0.14), inset 0 1px 0 rgba(255,255,255,0.85)',
                  backdropFilter: 'blur(32px) saturate(1.2)',
                  WebkitBackdropFilter: 'blur(32px) saturate(1.2)',
                  padding: '0 8px 0 17px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    width: '100%',
                    height: 50,
                    display: 'flex',
                    alignItems: 'center',
                    background: 'transparent',
                    padding: '0 4px',
                    fontFamily: DISPLAY,
                    fontSize: 13,
                    lineHeight: '20px',
                    color: hasDraft ? t.ink : dark ? 'rgba(244,240,235,0.45)' : 'rgba(24,22,15,0.45)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {hasDraft ? draft : 'Сообщение Maya…'}
                </div>

                {/* app.html:21855 — a round blue ground, the same asymmetric MAYA wave, in white. */}
                <div
                  title="Нажмите — запись, ещё раз — отправить"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '0',
                    background: MAYA_ACCENT,
                    color: MAYA_ACCENT_ON,
                    cursor: 'pointer',
                    touchAction: 'none',
                    transition: 'transform .16s ease, background .16s ease',
                  }}
                >
                  <MayaVolumeMark size={18} />
                </div>

                {/* app.html:21861-21863 */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: hasDraft ? 'pointer' : 'default',
                    background: MAYA_ACCENT,
                    color: MAYA_ACCENT_ON,
                    boxShadow: '0 6px 16px rgba(10,132,255,.4)',
                    opacity: hasDraft ? 1 : 0.55,
                  }}
                >
                  <span style={{ fontSize: 16, fontWeight: 600 }}>↑</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
