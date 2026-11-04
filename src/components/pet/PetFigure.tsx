// The pet itself, one SVG per species with shared poses and accessories.
// Poses: sitting (cozy, glowing, comfort, celebrate), curled up (dozy, night)
// and the moving box (box, peek). Stage scales the body (Little is small with
// big eyes); level adds the collar tag, scarf, hat and glasses. The current
// pose is exposed as data-pose for tests (spec §5.3, gate 28).
import type { Gesture, PetStage, PetType } from '@/types/pet'
import type { PetPose } from './copy'

export interface PetFigureProps {
  type: PetType
  pose: PetPose
  stage: PetStage
  level: number
  /** Both initials for the collar tag, e.g. "EK". */
  initials?: string
  /** The gesture being played; change gestureKey to replay it. */
  gesture?: Gesture | null
  gestureKey?: number
  className?: string
  /** Accessible name; the figure is decorative when omitted. */
  label?: string
}

interface Fur {
  main: string
  dark: string
  belly: string
  inner: string
}

const FUR: Record<PetType, Fur> = {
  cat: { main: '#F5C090', dark: '#E9A872', belly: '#FFE8D0', inner: '#FFB0B0' },
  dog: { main: '#D4A060', dark: '#B07840', belly: '#F0D8B0', inner: '#F08080' },
}

const SCARF = ['#F06B6B', '#7EC4A0', '#E8C078', '#8FA8E8', '#C49BE0']
const HAT = ['#5C7CC4', '#F06B6B', '#5EAE85', '#E8A15C', '#9B6FC4']

/** A new scarf and hat colour every 5 levels from level 20. */
export function accessoryColor(level: number): number {
  return level >= 20 ? Math.floor((level - 15) / 5) % SCARF.length : 0
}

const STAGE_SCALE: Record<PetStage, number> = { little: 0.8, growing: 0.9, grown: 1, wise: 1 }

interface Head {
  cx: number
  cy: number
  r: number
}

function Eyes({ head, pose, big }: { head: Head; pose: PetPose; big: boolean }) {
  const dx = head.r * 0.43
  const y = head.cy - head.r * 0.05
  const r = big ? 6.6 : 5.4
  const xs = [head.cx - dx, head.cx + dx]
  if (pose === 'dozy' || pose === 'night') {
    return (
      <g stroke="#2D2424" strokeWidth="2" fill="none" strokeLinecap="round">
        {xs.map((x) => <path key={x} d={`M${x - 5} ${y} Q${x} ${y + 4.5} ${x + 5} ${y}`} />)}
      </g>
    )
  }
  if (pose === 'glowing') {
    return (
      <g stroke="#2D2424" strokeWidth="2.4" fill="none" strokeLinecap="round">
        {xs.map((x) => <path key={x} d={`M${x - 5.5} ${y + 1.5} Q${x} ${y - 5} ${x + 5.5} ${y + 1.5}`} />)}
      </g>
    )
  }
  const soft = pose === 'comfort'
  return (
    <>
      {xs.map((x, i) => (
        <g key={x} className="pa-blink" style={{ animationDelay: `${i * 0.12}s` }}>
          <ellipse cx={x} cy={y} rx={r} ry={soft ? r * 0.72 : r} fill="#2D2424" />
          <circle cx={x + r * 0.32} cy={y - r * 0.34} r={r * 0.36} fill="#fff" />
        </g>
      ))}
      {soft && xs.map((x) => (
        <path key={`lid${x}`} d={`M${x - r - 1} ${y - r * 0.3} Q${x} ${y - r * 1.1} ${x + r + 1} ${y - r * 0.3}`} stroke="#2D2424" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      ))}
    </>
  )
}

function Blush({ head }: { head: Head }) {
  const dx = head.r * 0.62
  const y = head.cy + head.r * 0.26
  return (
    <g fill="#FFB0C0" opacity="0.4">
      <ellipse cx={head.cx - dx} cy={y} rx="6.5" ry="4" />
      <ellipse cx={head.cx + dx} cy={y} rx="6.5" ry="4" />
    </g>
  )
}

function CatFace({ head, pose, big, fur }: { head: Head; pose: PetPose; big: boolean; fur: Fur }) {
  const { cx, cy, r } = head
  const asleep = pose === 'dozy' || pose === 'night'
  return (
    <>
      <polygon points={`${cx - r * 0.86},${cy - r * 0.55} ${cx - r * 1.02},${cy - r * 1.42} ${cx - r * 0.25},${cy - r * 0.92}`} fill={fur.main} />
      <polygon points={`${cx - r * 0.78},${cy - r * 0.62} ${cx - r * 0.9},${cy - r * 1.25} ${cx - r * 0.38},${cy - r * 0.92}`} fill={fur.inner} opacity="0.55" />
      <polygon points={`${cx + r * 0.86},${cy - r * 0.55} ${cx + r * 1.02},${cy - r * 1.42} ${cx + r * 0.25},${cy - r * 0.92}`} fill={fur.main} />
      <polygon points={`${cx + r * 0.78},${cy - r * 0.62} ${cx + r * 0.9},${cy - r * 1.25} ${cx + r * 0.38},${cy - r * 0.92}`} fill={fur.inner} opacity="0.55" />
      <circle cx={cx} cy={cy} r={r} fill={fur.main} />
      <Eyes head={head} pose={pose} big={big} />
      <ellipse cx={cx} cy={cy + r * 0.3} rx="3.8" ry="2.8" fill="#E07090" />
      {pose === 'celebrate' ? (
        <path d={`M${cx - 5} ${cy + r * 0.4} Q${cx} ${cy + r * 0.62} ${cx + 5} ${cy + r * 0.4} Z`} fill="#C05070" />
      ) : (
        <path d={`M${cx - 4.5} ${cy + r * 0.4} Q${cx} ${cy + r * (asleep ? 0.46 : 0.52)} ${cx + 4.5} ${cy + r * 0.4}`} stroke="#C05070" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      )}
      <g stroke="#C0A090" strokeWidth="0.9" opacity="0.45">
        <line x1={cx - 3} y1={cy + r * 0.3} x2={cx - r * 1.2} y2={cy + r * 0.18} />
        <line x1={cx - 3} y1={cy + r * 0.32} x2={cx - r * 1.2} y2={cy + r * 0.4} />
        <line x1={cx + 3} y1={cy + r * 0.3} x2={cx + r * 1.2} y2={cy + r * 0.18} />
        <line x1={cx + 3} y1={cy + r * 0.32} x2={cx + r * 1.2} y2={cy + r * 0.4} />
      </g>
      <Blush head={head} />
    </>
  )
}

function DogFace({ head, pose, big, fur }: { head: Head; pose: PetPose; big: boolean; fur: Fur }) {
  const { cx, cy, r } = head
  const asleep = pose === 'dozy' || pose === 'night'
  const tongue = !asleep && pose !== 'comfort'
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={fur.main} />
      <ellipse cx={cx - r * 1.02} cy={cy - r * 0.08} rx={r * 0.44} ry={r * 0.74} fill={fur.dark} transform={`rotate(${asleep ? 8 : 15} ${cx - r * 1.02} ${cy - r * 0.08})`} />
      <ellipse cx={cx + r * 1.02} cy={cy - r * 0.08} rx={r * 0.44} ry={r * 0.74} fill={fur.dark} transform={`rotate(${asleep ? -8 : -15} ${cx + r * 1.02} ${cy - r * 0.08})`} />
      <Eyes head={head} pose={pose} big={big} />
      <ellipse cx={cx} cy={cy + r * 0.4} rx={r * 0.46} ry={r * 0.32} fill={fur.belly} />
      <ellipse cx={cx} cy={cy + r * 0.3} rx="4.8" ry="3.8" fill="#3D2D2D" />
      <path d={`M${cx - 5.5} ${cy + r * 0.46} Q${cx} ${cy + r * 0.66} ${cx + 5.5} ${cy + r * 0.46}`} stroke="#8B6050" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {tongue && <ellipse cx={cx} cy={cy + r * 0.66} rx="3.6" ry={pose === 'celebrate' || pose === 'glowing' ? 5.5 : 4.2} fill={fur.inner} />}
      <Blush head={head} />
    </>
  )
}

function Hat({ head, color }: { head: Head; color: string }) {
  const { cx, cy, r } = head
  const top = cy - r * 0.92
  return (
    <g>
      <path d={`M${cx - r * 0.62} ${top + 4} Q${cx} ${top - r * 0.75} ${cx + r * 0.62} ${top + 4} Z`} fill={color} />
      <rect x={cx - r * 0.7} y={top} width={r * 1.4} height="6" rx="3" fill="#fff" opacity="0.85" />
      <circle cx={cx} cy={top - r * 0.46} r="4.2" fill="#fff" />
    </g>
  )
}

function Glasses({ head }: { head: Head }) {
  const dx = head.r * 0.43
  const y = head.cy - head.r * 0.05
  return (
    <g stroke="#5C4E4E" strokeWidth="1.8" fill="#fff" fillOpacity="0.18">
      <circle cx={head.cx - dx} cy={y} r="8.2" />
      <circle cx={head.cx + dx} cy={y} r="8.2" />
      <path d={`M${head.cx - dx + 8} ${y} Q${head.cx} ${y - 3} ${head.cx + dx - 8} ${y}`} fill="none" />
    </g>
  )
}

function Neckwear({ x, y, w, level, initials, scarfColor }: { x: number; y: number; w: number; level: number; initials?: string; scarfColor: string }) {
  const half = w / 2
  return (
    <g>
      {level >= 5 ? (
        <>
          <path d={`M${x - half} ${y - 2} Q${x} ${y + 9} ${x + half} ${y - 2}`} stroke={scarfColor} strokeWidth="8" fill="none" strokeLinecap="round" />
          <path d={`M${x + half * 0.45} ${y + 3} l5 16 l7 -2 l-3 -15 z`} fill={scarfColor} />
          <path d={`M${x - half * 0.9} ${y} Q${x} ${y + 7} ${x + half * 0.9} ${y}`} stroke="#fff" strokeOpacity="0.35" strokeWidth="1.2" fill="none" strokeDasharray="3 3" />
        </>
      ) : (
        <path d={`M${x - half} ${y - 2} Q${x} ${y + 8} ${x + half} ${y - 2}`} stroke="#F06B6B" strokeWidth="5" fill="none" strokeLinecap="round" />
      )}
      {level >= 2 && (
        <g>
          <circle cx={x - (level >= 5 ? half * 0.35 : 0)} cy={y + 9} r="6.2" fill="#E8C078" stroke="#C8A040" strokeWidth="1" />
          {initials && (
            <text x={x - (level >= 5 ? half * 0.35 : 0)} y={y + 11} textAnchor="middle" fontSize="5.4" fontWeight="700" fill="#7A5A20" fontFamily="system-ui, sans-serif">
              {initials}
            </text>
          )}
        </g>
      )}
    </g>
  )
}

function Box({ front }: { front: boolean }) {
  if (!front) {
    return <path d="M36 102 L54 88 L106 88 L124 102 Z" fill="#B98A52" />
  }
  return (
    <g>
      <rect x="34" y="102" width="92" height="48" rx="3" fill="#D9A86C" />
      <rect x="34" y="102" width="92" height="7" fill="#C8955A" />
      <path d="M34 102 L18 92 L26 86 L42 98 Z" fill="#E2B57C" />
      <path d="M126 102 L142 92 L134 86 L118 98 Z" fill="#E2B57C" />
      <rect x="72" y="109" width="16" height="41" fill="#F0D49E" opacity="0.7" />
      <text x="56" y="136" fontSize="7" fill="#9A6A34" fontFamily="system-ui, sans-serif" fontWeight="700">THIS SIDE UP</text>
    </g>
  )
}

function Zzz({ x, y, moon }: { x: number; y: number; moon: boolean }) {
  return (
    <g fill="#8C9BC4" fontFamily="system-ui, sans-serif" fontWeight="800">
      {moon && <path d={`M${x + 34} ${y - 6} a8 8 0 1 0 6 13 a6.5 6.5 0 1 1 -6 -13 z`} fill="#F0D49E" />}
      <text x={x} y={y} fontSize="11" className="pa-zzz">z</text>
      <text x={x + 8} y={y - 8} fontSize="13" className="pa-zzz" style={{ animationDelay: '1.2s' }}>z</text>
      <text x={x + 17} y={y - 18} fontSize="15" className="pa-zzz" style={{ animationDelay: '2.4s' }}>Z</text>
    </g>
  )
}

function Sparkles() {
  const at: [number, number, number][] = [[26, 52, 0], [134, 44, 0.6], [140, 108, 1.2], [20, 112, 1.6]]
  return (
    <g fill="#E8C078">
      {at.map(([x, y, d]) => (
        <path key={`${x}${y}`} className="pa-twinkle" style={{ animationDelay: `${d}s` }}
          d={`M${x} ${y - 6} L${x + 1.6} ${y - 1.6} L${x + 6} ${y} L${x + 1.6} ${y + 1.6} L${x} ${y + 6} L${x - 1.6} ${y + 1.6} L${x - 6} ${y} L${x - 1.6} ${y - 1.6} Z`} />
      ))}
    </g>
  )
}

function GestureProp({ gesture, head }: { gesture: Gesture; head: Head }) {
  if (gesture === 'pat') {
    return (
      <g className="pa-prop" style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
        <path transform={`translate(${head.cx + head.r * 0.8} ${head.cy - head.r * 1.2}) scale(0.7)`}
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill="#F06B6B" />
      </g>
    )
  }
  if (gesture === 'snack') {
    const x = head.cx + head.r * 0.55
    const y = head.cy + head.r * 0.75
    return (
      <g className="pa-prop">
        <circle cx={x} cy={y} r="7" fill="#D4A05C" />
        <circle cx={x - 2.5} cy={y - 2} r="1.3" fill="#7A4A20" />
        <circle cx={x + 2.2} cy={y + 1} r="1.3" fill="#7A4A20" />
        <circle cx={x - 0.5} cy={y + 3} r="1" fill="#7A4A20" />
      </g>
    )
  }
  return (
    <g className="pa-ball">
      <circle cx="132" cy="132" r="8" fill="#7EC4A0" />
      <path d="M124 132 Q132 126 140 132 M124 132 Q132 138 140 132" stroke="#fff" strokeWidth="1.4" fill="none" />
    </g>
  )
}

export default function PetFigure({ type, pose, stage, level, initials, gesture, gestureKey = 0, className, label }: PetFigureProps) {
  const fur = FUR[type]
  const scale = STAGE_SCALE[stage]
  const big = stage === 'little'
  const colorIx = accessoryColor(level)
  const scarfColor = SCARF[colorIx]
  const hatColor = HAT[colorIx]
  const Face = type === 'dog' ? DogFace : CatFace
  const curled = pose === 'dozy' || pose === 'night'
  const inBox = pose === 'box' || pose === 'peek'
  const gestureClass = gesture ? (pose === 'celebrate' ? 'pa-g-cheer' : `pa-g-${gesture}`) : pose === 'celebrate' ? 'pa-g-cheer' : ''

  let body: React.ReactNode
  let head: Head
  if (inBox) {
    head = pose === 'peek' ? { cx: 80, cy: 86, r: 24 } : { cx: 80, cy: 112, r: 24 }
    body = (
      <>
        <Box front={false} />
        <g className={pose === 'peek' ? 'pa-peek' : 'pa-bob'}>
          <Face head={head} pose="cozy" big={big} fur={fur} />
          {pose === 'peek' && (
            <g fill={fur.dark}>
              <ellipse cx="64" cy="103" rx="8" ry="5" />
              <ellipse cx="96" cy="103" rx="8" ry="5" />
            </g>
          )}
        </g>
        <Box front />
      </>
    )
  } else if (curled) {
    head = { cx: 48, cy: 112, r: 27 }
    body = (
      <g className="pa-breathe-slow">
        <path d="M124 144 Q156 142 150 120 Q146 108 134 114" stroke={fur.dark} strokeWidth="11" fill="none" strokeLinecap="round" />
        <ellipse cx="88" cy="126" rx="56" ry="26" fill={fur.main} />
        <ellipse cx="94" cy="134" rx="36" ry="14" fill={fur.belly} opacity="0.55" />
        <ellipse cx="52" cy="144" rx="13" ry="6.5" fill={fur.dark} />
        <ellipse cx="76" cy="148" rx="11" ry="5.5" fill={fur.dark} />
        <Neckwear x={70} y={128} w={34} level={level} scarfColor={scarfColor} />
        <Face head={head} pose={pose} big={big} fur={fur} />
        {level >= 10 && <Hat head={head} color={hatColor} />}
        {level >= 15 && <Glasses head={head} />}
      </g>
    )
  } else {
    head = type === 'dog' ? { cx: 80, cy: 72, r: 30 } : { cx: 80, cy: 74, r: 29 }
    const raised = pose === 'celebrate'
    body = (
      <g className="pa-breathe">
        <path
          d={type === 'dog' ? 'M110 128 Q146 104 134 80' : 'M108 136 Q142 118 128 86'}
          stroke={fur.dark} strokeWidth={type === 'dog' ? 10 : 11} fill="none" strokeLinecap="round"
          className={pose === 'glowing' || raised ? 'pa-wag' : 'pa-tail'}
          style={{ transformOrigin: type === 'dog' ? '110px 128px' : '108px 136px' }}
        />
        <ellipse cx="80" cy="118" rx={type === 'dog' ? 37 : 35} ry="30" fill={fur.main} />
        <ellipse cx="80" cy="124" rx="23" ry="19" fill={fur.belly} opacity="0.65" />
        <ellipse cx="60" cy="146" rx="11" ry="6.5" fill={fur.dark} />
        <ellipse cx="100" cy="146" rx="11" ry="6.5" fill={fur.dark} />
        {raised && (
          <g fill={fur.dark}>
            <ellipse cx="44" cy="96" rx="7" ry="11" transform="rotate(-28 44 96)" />
            <ellipse cx="116" cy="96" rx="7" ry="11" transform="rotate(28 116 96)" />
          </g>
        )}
        <Face head={head} pose={pose} big={big} fur={fur} />
        {pose !== 'comfort' && <Neckwear x={80} y={head.cy + head.r * 0.72} w={58} level={level} initials={initials} scarfColor={scarfColor} />}
        {level >= 10 && <Hat head={head} color={hatColor} />}
        {level >= 15 && <Glasses head={head} />}
        {pose === 'comfort' && (
          <g>
            <path d="M54 98 Q80 88 106 98 Q122 116 128 142 Q114 150 100 146 Q90 152 80 147 Q70 152 60 146 Q46 150 32 142 Q38 116 54 98 Z" fill="#A9BCE8" />
            <path d="M44 120 Q80 112 116 120 M38 134 Q80 126 122 134" stroke="#fff" strokeOpacity="0.55" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M80 92 Q74 112 70 146" stroke="#8FA8E8" strokeWidth="1.6" fill="none" opacity="0.7" />
            <path d="M54 98 Q80 88 106 98" stroke="#8FA8E8" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <ellipse cx="62" cy="148" rx="9" ry="5" fill={fur.dark} />
            <ellipse cx="98" cy="148" rx="9" ry="5" fill={fur.dark} />
          </g>
        )}
      </g>
    )
  }

  return (
    <svg
      viewBox="0 0 160 160"
      className={className}
      data-pose={pose}
      data-stage={stage}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ overflow: 'visible' }}
    >
      {pose === 'glowing' && <Sparkles />}
      <g transform={`translate(80 150) scale(${inBox ? 1 : scale}) translate(-80 -150)`}>
        <g key={gestureKey} className={gestureClass}>
          {body}
        </g>
        {gesture && !inBox && <GestureProp key={`p${gestureKey}`} gesture={gesture} head={head} />}
      </g>
      {curled && <Zzz x={66} y={74} moon={pose === 'night'} />}
    </svg>
  )
}
