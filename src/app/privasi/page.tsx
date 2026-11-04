import Link from 'next/link'
import { ArrowLeft, Shield } from 'lucide-react'

export const metadata = { title: 'Privacy & Data | Nanti Kita' }

// Plain-language summary of how the app handles data, written from what the
// code actually does (AI inputs: src/app/api/ai/*, src/lib/pet-ai.ts,
// src/lib/samakan-ai.ts). Review with the owner before each deploy if features change.
const SECTIONS = [
  {
    title: 'What we store',
    items: [
      'Account: your email and password (the password is stored encrypted by the login service).',
      'Profile: name, gender, date of birth, the date you got together, and profile photo.',
      'Shared data: answers to questions and quizzes, Letters, the calendar, savings and wishlist, game results, and Moments (photo, title, date, place name, GPS coordinates, and story).',
      'Pet Kita: its name, type and level, a log of the warmth it got (what kind of thing happened and when, never what was written), your visits, and its daily notes.',
      'Device: your push notification address, only if you turn on notifications.',
    ],
  },
  {
    title: 'Who can see it',
    items: [
      'Only you and your partner can see your shared data.',
      'Moment photos are kept in private storage and shown only through temporary links, to the two of you.',
      'The recipient of a letter can\'t read it before its opening time, including through another app.',
      'The app admin can see account profile data in order to manage users, but can\'t open your shared data, your Moment photos, or the contents of your letters.',
    ],
  },
  {
    title: 'Location',
    items: [
      'Your location is used only when you tap the button to use your current location, or when a photo you choose has a location saved in it.',
      'The coordinates are stored only in that Moment. To look up the place name, they are sent to OpenStreetMap.',
    ],
  },
  {
    title: 'AI features (Claude by Anthropic)',
    items: [
      'Every AI feature in Nanti Kita uses Claude, made by Anthropic. Only the details listed here are sent, to Anthropic and to no other AI provider, so Claude can write the text. Under Anthropic\'s commercial terms, what the app sends isn\'t used to train its models.',
      'AI questions. What is sent: your nicknames, gender, age, MBTI type, how long you\'ve been together, the day of the week, the titles and dates of upcoming calendar events, and your last 7 AI questions.',
      'AI date ideas. What is sent: the filters you picked (budget, vibe, type of place), your city if you enter one, today\'s date, and the titles on your Bucket List. Names and profile data are not sent.',
      'Pet Kita\'s daily note. Titles and mood labels only: up to 3 titles (a Moment, a finished Bucket List item, a Samakan score), the title of your next shared calendar event, and whether today\'s mood label is a heavy one, plus your first names, the pet\'s name and level, and how many things happened this week (counts, not content). Letters, Jar notes, answers, comments, mood notes and money are never sent. In a week with no activity, nothing is sent and the note comes from a template.',
      'Samakan personal rounds ("For you two"), only while the Personal rounds switch is on. What is sent: both your first names, how many days you\'ve been together, your Daily Question answers from days you both answered, Moment titles, places and months, how often each of you picked each mood (labels only), and your own past Samakan prompts. Never sent: Bucket List titles, love languages, letters, Jar notes, comments, mood notes or photos.',
      'To turn personal rounds off, open Profile and switch off Personal rounds. It works for both of you: nothing above is read or sent, and the rounds come from the general set.',
      'Samakan read-out. After you finish a set, that set\'s rounds and both your answers are sent so Claude can write the short read-out.',
    ],
  },
  {
    title: 'Other services',
    items: [
      'Supabase: database and login, plus photo storage.',
      'Vercel: app hosting.',
      'OpenStreetMap: place names and maps in Moments.',
      'Your browser\'s built-in push service (Google, Apple, or Mozilla): delivers notifications.',
    ],
  },
  {
    title: 'Deleting your data',
    items: [
      'You can delete Moments, photos, transactions and other data directly in the app.',
      'Export my data (Profile → Settings) gives you a copy of your data in one file.',
      'Leave this couple (Profile → Danger zone) closes your shared space: your shared memories stay saved for your partner, but no one new can join that space.',
      'Delete account (Profile → Danger zone) deletes your account, your profile, your profile photo, and the letters and Jar notes that involve you. If you are the last member, the whole space and its photos are deleted too.',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <div className="animate-fade-in px-6 pb-12 pt-6">
      <Link href="/app/profile" className="mb-5 flex items-center gap-1 text-sm text-ink-muted">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sage/15">
          <Shield className="h-5 w-5 text-sage-dark" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink">Privacy & Data</h1>
          <p className="text-xs text-ink-muted">How Nanti Kita handles your data</p>
        </div>
      </div>

      <div className="space-y-6">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="mb-2 text-sm font-bold text-ink">{section.title}</h2>
            <ul className="space-y-2">
              {section.items.map((item) => (
                <li key={item} className="flex gap-2 text-sm leading-relaxed text-ink-muted">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose/60" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-8 text-[11px] text-ink-muted/70">Last updated 4 November 2026</p>
    </div>
  )
}
