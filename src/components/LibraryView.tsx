import {ShareButton} from './ShareButton';
import {testIntroductionPath} from '../services/testUrls.js';
import {TestCover} from "./TestCover";
import {Select} from "./Select";
import { FolderBrowser } from "./FolderBrowser";
import { compareTests, inFolder, sortOptions, latestAttempt, allFolderPaths } from "../services/catalog";
import React, { useMemo, useState } from "react";
import {
  BookOpen,
  ArrowUpRight,
  Search,
  Star,
  Clock,
  Headphones,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import type { TestMeta, UserProfile, AttemptRecord } from "../types";
interface Props {
  tests: TestMeta[];
  attempts: AttemptRecord[];
  profile: UserProfile;
  isAdmin: boolean;
  onSelectTest: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onNavigateToMock: () => void;
  onNavigateToAdmin: () => void;
}
export const LibraryView: React.FC<Props> = ({
  tests,
  attempts,
  profile,
  isAdmin,
  onSelectTest,
  onToggleFavorite,
  onNavigateToMock,
  onNavigateToAdmin,
}) => {
  const [skill, setSkill] = useState<"reading" | "listening">("reading");
  const [search, setSearch] = useState(""),
    [source, setSource] = useState(""),
    [scope, setScope] = useState("all"),
    [sort, setSort] = useState("new"),
    [page, setPage] = useState(0);
  const [completion, setCompletion] = useState("all");
  const [recursive, setRecursive] = useState(true);
  const published = tests.filter(
    (t) => t.status === "published" && t.skill === skill,
  );
  const sources = allFolderPaths(published);
  const filtered = useMemo(
    () =>
      tests
        .filter(
          (t) =>
            t.status === "published" &&
            t.skill === skill &&
            inFolder(t.source || "Unfiled", source, recursive) &&
            (completion === "all" || (completion === "done" ? attempts.some(a => a.testId === t.id) : !attempts.some(a => a.testId === t.id))) &&
            (!search ||
              `${t.title} ${t.source} ${(t.passageTitles || []).join(" ")}`
                .toLowerCase()
                .includes(search.toLowerCase())) &&
            (scope !== "full" || t.passages > 1) &&
            (scope !== "single" || t.passages === 1) &&
            (scope !== "favorites" || profile.favorites.includes(t.id)),
        )
        .sort((a, b) =>
          sort === "attempted" ? latestAttempt(attempts, b.id) - latestAttempt(attempts, a.id) || compareTests(a, b, "title") : compareTests(a, b, sort),
        ),
    [tests, skill, source, search, scope, sort, profile.favorites, completion, recursive, attempts],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 12)),
    current = Math.min(page, pages - 1);
  const bands = attempts
    .map((a) => a.band)
    .filter((b): b is number => typeof b === "number" && Number.isFinite(b));
  const openLink = (event: React.MouseEvent, id: string) => {
    if (
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      event.button === 0
    ) {
      event.preventDefault();
      onSelectTest(id);
    }
  };
  return (
    <div className="library-page">
      <div className="welcome-row">
        <span>YOUR NEXT CHAPTER</span>
        <span>
          Take it one passage at a time <Sparkles size={15} />
        </span>
      </div>
      <section className="library-hero">
        <div className="hero-copy">
          <span className="pill">A space to grow your IELTS skills</span>
          <h1>
            A little practice.
            <br />
            <em>A big difference.</em>
          </h1>
          <p>
            Find your focus, challenge yourself, and build the confidence to
            reach your next band.
          </p>
          <button
            className="studio-primary"
            onClick={() =>
              document
                .getElementById("test-catalog")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Find your next test <ArrowRight size={17} />
          </button>
          <small>No account needed. Your progress starts here.</small>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="art-spark">✦</span>
          <div className="book book-back">
            WORDS
            <br />
            OPEN
            <br />
            WORLDS.
          </div>
          <div className="book book-front">
            <BookOpen size={42} />
            <span>
              A fresh
              <br />
              perspective.
            </span>
            <small>READING STUDIO / IELTS</small>
          </div>
          <span className="art-note">one page closer ↗</span>
        </div>
      </section>
      <div className="library-metrics">
        <div>
          <span className="metric-icon lavender">
            <BookOpen size={22} />
          </span>
          <p>
            <strong>{published.length}</strong>
            <span>tests to explore</span>
          </p>
        </div>
        <div>
          <span className="metric-icon peach">
            <Clock size={22} />
          </span>
          <p>
            <strong>{attempts.length}</strong>
            <span>sessions completed</span>
          </p>
        </div>
        <div>
          <span className="metric-icon mint">
            <Sparkles size={22} />
          </span>
          <p>
            <strong>
              {bands.length ? Math.max(...bands).toFixed(1) : "—"}
            </strong>
            <span>best estimated band</span>
          </p>
        </div>
      </div>
      <section id="test-catalog" className="test-catalog">
        <div className="section-heading">
          <div>
            <span className="studio-eyebrow">THE PRACTICE SHELF</span>
            <h2>Find your next challenge.</h2>
          </div>
          <button className="text-link" onClick={onNavigateToMock}>
            Build a mock test <ArrowUpRight size={17} />
          </button>
        </div>
        <div className="skill-switch" aria-label="Test skill">
          {(["reading", "listening"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={skill === value}
              className={skill === value ? "active" : ""}
              onClick={() => {
                setSkill(value);
                setSource("");
                setPage(0);
              }}
            >
              {value === "reading" ? (
                <BookOpen size={17} />
              ) : (
                <Headphones size={17} />
              )}{" "}
              {value === "reading" ? "Reading" : "Listening"}
            </button>
          ))}
        </div>
        <FolderBrowser tests={published} value={source} onChange={path => { setSource(path); setPage(0); }} />
        <div className="catalog-tools">
          <label className="catalog-search">
            <Search size={18} />
            <input
              aria-label="Search tests"
              placeholder="Search by title or collection…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <Select
            aria-label="Collection"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All collections</option>
            {sources.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <Select
            aria-label="Sort tests"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            {sortOptions.map(([id,label]) => <option key={id} value={id}>{label}</option>)}
            <option value="attempted">Recently attempted</option>
          </Select>
        </div>
        <div className="catalog-tools">
          <Select aria-label="Attempt status" value={completion} onChange={e => {setCompletion(e.target.value);setPage(0);}}><option value="all">All attempt statuses</option><option value="done">Attempted</option><option value="new">Not attempted</option></Select>
          <label><input type="checkbox" checked={recursive} onChange={e => {setRecursive(e.target.checked);setPage(0);}} /> Include subfolders</label>
        </div>
        <div className="catalog-scopes">
          {[
            ["all", "All tests"],
            ["full", "Full tests"],
            ["single", "Single passages"],
            ["favorites", "Saved"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={scope === id}
              className={scope === id ? "active" : ""}
              onClick={() => {
                setScope(id);
                setPage(0);
              }}
            >
              {label}
            </button>
          ))}
          <span>{filtered.length} tests</span>
        </div>
        <div className="test-card-grid">
          {filtered.slice(current * 12, current * 12 + 12).map((test, i) => (
            <article className="reading-card" key={test.id}>
              <div className={`card-art color-${i % 4}`}>
                <span className="card-art-lines" />
                <TestCover id={test.id} title={test.title} image={test.coverImage} skill={test.skill}/><div className="thumbnail-share"><ShareButton compact path={testIntroductionPath(test)} title={test.title}/></div>
                <span className="card-art-label">
                  {test.passages > 1 ? "THE FULL PICTURE" : "A CLOSER LOOK"}
                </span>
                <button
                  className={`favorite-button ${profile.favorites.includes(test.id) ? "saved" : ""}`}
                  aria-label={`${profile.favorites.includes(test.id) ? "Unsave" : "Save"} ${test.title}`}
                  aria-pressed={profile.favorites.includes(test.id)}
                  onClick={() => onToggleFavorite(test.id)}
                >
                  <Star
                    size={17}
                    fill={
                      profile.favorites.includes(test.id)
                        ? "currentColor"
                        : "none"
                    }
                  />
                </button>
              </div>
              <div className="reading-card-body">
                <span className="collection-label">
                  {test.source || "IELTS collection"}
                </span>
                <h3>
                  <a
                    href={`/tests/${encodeURIComponent(test.id)}`}
                    onClick={(e) => openLink(e, test.id)}
                  >
                    {test.title}
                  </a>
                </h3>
                {test.passageTitles?.length ? <ol className="passage-titles">{test.passageTitles.map((title, index) => <li key={index}>{title}</li>)}</ol> : null}
                <div className="card-details">
                  <span>
                    {test.passages}{" "}
                    {test.passages === 1 ? "passage" : "passages"}
                  </span>
                  <span>{test.questions} questions</span>
                  <span>{test.duration} min</span>
                </div>
                <div className="card-bottom">
                  <span>
                    {attempts.some((a) => a.testId === test.id)
                      ? "Practised before"
                      : "A fresh start"}
                  </span>
                  <a
                    href={`/tests/${encodeURIComponent(test.id)}`}
                    onClick={(e) => openLink(e, test.id)}
                    aria-label={`Start ${test.title}`}
                  >
                    Start test <ArrowUpRight size={16} />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
        {!filtered.length && (
          <div className="studio-empty">
            <BookOpen size={32} />
            <h3>
              {published.length
                ? "No tests match your search."
                : "Your next chapter is on its way."}
            </h3>
            <p>
              {published.length
                ? "Try another title, collection, or filter."
                : "Published tests will appear here as the library grows."}
            </p>
            {isAdmin && (
              <button className="studio-primary" onClick={onNavigateToAdmin}>
                Manage library
              </button>
            )}
          </div>
        )}
        {pages > 1 && (
          <div className="catalog-pagination">
            <button
              className="studio-secondary"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </button>
            <span>
              Page {current + 1} of {pages}
            </span>
            <button
              className="studio-secondary"
              disabled={current + 1 === pages}
              onClick={() => setPage(current + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

