import type { Repository } from '../api/github'
import { formatCompact, formatDate, formatNumber, formatRelative } from '../lib/format'
import { languageColor } from '../lib/languageColors'
import { ClockIcon, ForkIcon, LicenseIcon, StarIcon } from './icons'

const MAX_TOPICS = 5

export function RepoCard({ repo }: { repo: Repository }) {
  const [owner, ...rest] = repo.fullName.split('/')
  const name = rest.join('/')

  return (
    <article className="repo-card">
      <header className="repo-card__header">
        {repo.owner.avatarUrl && (
          <img
            className="repo-card__avatar"
            src={`${repo.owner.avatarUrl}${repo.owner.avatarUrl.includes('?') ? '&' : '?'}s=48`}
            alt=""
            width={24}
            height={24}
            loading="lazy"
          />
        )}
        <h3 className="repo-card__title">
          <a href={repo.url} target="_blank" rel="noopener noreferrer">
            <span className="repo-card__owner">{owner}/</span>
            <span className="repo-card__name">{name}</span>
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        </h3>
        {repo.archived && <span className="badge badge--warning">Archived</span>}
        {repo.fork && <span className="badge">Fork</span>}
      </header>

      {repo.description ? (
        <p className="repo-card__description">{repo.description}</p>
      ) : (
        <p className="repo-card__description repo-card__description--empty">No description provided.</p>
      )}

      {repo.topics.length > 0 && (
        <ul className="repo-card__topics" aria-label="Topics">
          {repo.topics.slice(0, MAX_TOPICS).map((topic) => (
            <li key={topic} className="topic">
              {topic}
            </li>
          ))}
          {repo.topics.length > MAX_TOPICS && (
            <li className="topic topic--more">+{repo.topics.length - MAX_TOPICS}</li>
          )}
        </ul>
      )}

      <dl className="repo-card__meta">
        <div title={`${formatNumber(repo.stars)} stars`}>
          <dt>Stars</dt>
          <dd>
            <StarIcon />
            {formatCompact(repo.stars)}
          </dd>
        </div>
        <div title={`${formatNumber(repo.forks)} forks`}>
          <dt>Forks</dt>
          <dd>
            <ForkIcon />
            {formatCompact(repo.forks)}
          </dd>
        </div>
        {repo.language && (
          <div>
            <dt>Language</dt>
            <dd>
              <span
                className="repo-card__language-dot"
                aria-hidden="true"
                style={{ backgroundColor: languageColor(repo.language) }}
              />
              {repo.language}
            </dd>
          </div>
        )}
        {repo.license && (
          <div>
            <dt>License</dt>
            <dd>
              <LicenseIcon />
              {repo.license}
            </dd>
          </div>
        )}
        {repo.updatedAt && (
          <div>
            <dt>Updated</dt>
            <dd>
              <ClockIcon />
              <time dateTime={repo.updatedAt.toISOString()} title={formatDate(repo.updatedAt)}>
                <span aria-hidden="true">Updated </span>
                {formatRelative(repo.updatedAt)}
              </time>
            </dd>
          </div>
        )}
      </dl>
    </article>
  )
}
