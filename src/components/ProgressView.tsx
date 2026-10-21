import React, { useState } from 'react';
import { AttemptRecord, UserProfile } from '../types';

interface ProgressViewProps {
  attempts: AttemptRecord[];
  profile: UserProfile;
  onOpenProfileModal: () => void;
  onReopenAttempt: (attempt: AttemptRecord) => void;
}

export const ProgressView: React.FC<ProgressViewProps> = ({
  attempts,
  profile,
  onOpenProfileModal,
  onReopenAttempt,
}) => {
  const [selectedAttempt, setSelectedAttempt] = useState<AttemptRecord | null>(null);

  const bands = attempts
    .map((a) => a.band)
    .filter((b): b is number => typeof b === 'number' && !isNaN(b));

  const averageBand = bands.length > 0
    ? (bands.reduce((sum, b) => sum + b, 0) / bands.length).toFixed(1)
    : '—';

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">YOUR STUDY JOURNAL</div>
          <h1 className="studio-heading">Every session counts.</h1>
          <p className="studio-lead">
            Review your test history, revisit tricky questions, analyze error trends, and track your
            progress toward your target band.
          </p>
        </div>

        <div className="studio-actions">
          <button className="studio-secondary" onClick={onOpenProfileModal}>
            Edit target band
          </button>
        </div>
      </div>

      <div className="studio-stats">
        <div className="studio-stat">
          <strong>{attempts.length}</strong>
          <span>sessions completed</span>
        </div>
        <div className="studio-stat">
          <strong>{averageBand}</strong>
          <span>average estimated band</span>
        </div>
        <div className="studio-stat">
          <strong>{profile.target.toFixed(1)}</strong>
          <span>your target band</span>
        </div>
      </div>

      <div className="studio-panel">
        <h3>Practice History</h3>

        {attempts.length === 0 ? (
          <div className="studio-empty">
            Your completed practice and exam sessions will appear here with detailed scoring breakdowns.
          </div>
        ) : (
          <div className="studio-table-wrap">
            <table className="studio-table">
              <thead>
                <tr>
                  <th>Test & Date</th>
                  <th>Result</th>
                  <th>Mode</th>
                  <th>Estimated Band</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {attempts
                  .slice()
                  .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
                  .map((att) => (
                    <tr key={att.id}>
                      <td>
                        <strong>{att.testTitle}</strong>
                        <br />
                        <span className="studio-small">
                          {new Date(att.createdAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </td>
                      <td>
                        {att.result.correct} / {att.result.gradable}
                        {att.result.ungraded > 0 && ` · ${att.result.ungraded} ungraded`}
                      </td>
                      <td>
                        <span className="studio-tag" style={{ textTransform: 'uppercase' }}>
                          {att.mode}
                        </span>
                      </td>
                      <td>{att.band !== null && att.band !== undefined ? att.band : '—'}</td>
                      <td>
                        <button
                          className="studio-quiet"
                          onClick={() => setSelectedAttempt(att)}
                        >
                          Review breakdown
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="studio-small" style={{ marginTop: '16px' }}>
          Official IELTS raw scores vary slightly between test versions. Band estimates are approximate
          and shown only for complete 40-question tests with all answer keys present.
        </p>
      </div>

      {/* Review Modal Dialog */}
      {selectedAttempt && (
        <dialog
          className="studio-modal"
          open
          style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 120 }}
        >
          <div className="studio-modal-heading">
            <h2>{selectedAttempt.testTitle}</h2>
            <button className="studio-quiet" onClick={() => setSelectedAttempt(null)}>
              ✕
            </button>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--teal)' }}>
              {selectedAttempt.result.correct} / {selectedAttempt.result.gradable} correct
            </span>
            {selectedAttempt.band !== null && selectedAttempt.band !== undefined && (
              <span style={{ marginLeft: '12px', fontSize: '15px', color: 'var(--studio-muted)' }}>
                (Estimated Band {selectedAttempt.band})
              </span>
            )}
            <div className="studio-small">
              {new Date(selectedAttempt.createdAt).toLocaleString()} · {selectedAttempt.mode.toUpperCase()}
            </div>
          </div>

          <div className="studio-table-wrap" style={{ maxHeight: '350px' }}>
            <table className="studio-table">
              <thead>
                <tr>
                  <th>Q#</th>
                  <th>Your Response</th>
                  <th>Accepted Answer</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedAttempt.result.rows.map((row) => (
                  <tr key={row.number} data-score={row.status}>
                    <td style={{ fontWeight: 600 }}>{row.number}</td>
                    <td>{row.response || '—'}</td>
                    <td>{row.answer ? row.answer.split('||').join(' / ') : '—'}</td>
                    <td style={{ fontWeight: 600 }}>
                      <span
                        style={{
                          color:
                            row.status === 'correct'
                              ? '#2b6136'
                              : row.status === 'ungraded'
                              ? '#805d38'
                              : '#944836',
                        }}
                      >
                        {row.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="studio-actions" style={{ marginTop: '20px' }}>
            <button
              className="studio-primary"
              onClick={() => {
                const att = selectedAttempt;
                setSelectedAttempt(null);
                onReopenAttempt(att);
              }}
            >
              Open Passage Review →
            </button>
            <button className="studio-secondary" onClick={() => setSelectedAttempt(null)}>
              Close
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
};
