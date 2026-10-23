import React, { useState } from 'react';
import { HardDrive, RefreshCw, Database, AlertCircle, CheckCircle2 } from 'lucide-react';
import { auth } from '../firebase';
import { requestJson } from '../services/apiRequest';
import { firestoreAdapter } from '../services/firestoreAdapter';
import { formatBytes } from '../services/storageUsage';
import type { TestMeta } from '../types';

interface Inventory {
  bytes: number;
  count: number;
  scannedAt: number;
  largest: { name: string; size: number }[];
  truncated: boolean;
  bucket?: string;
}

interface TestError {
  id: string;
  title: string;
  error: string;
}

export function StorageOverview({ tests }: { tests: TestMeta[] }) {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [busyStorage, setBusyStorage] = useState(false);
  const [storageError, setStorageError] = useState('');

  const [measured, setMeasured] = useState<Record<string, number>>({});
  const [busyMeasure, setBusyMeasure] = useState(false);
  const [measureProgress, setMeasureProgress] = useState('');
  const [measureErrors, setMeasureErrors] = useState<TestError[]>([]);
  const [measureSuccess, setMeasureSuccess] = useState('');
  const [rate, setRate] = useState('');

  const isMeasured = (t: TestMeta) => measured[t.id] !== undefined || t.contentBytes !== undefined;
  const getTestBytes = (t: TestMeta) => measured[t.id] ?? t.contentBytes ?? 0;

  const known = tests.filter(isMeasured);
  const unmeasured = tests.filter((t) => !isMeasured(t));
  const totalContentBytes = known.reduce((sum, t) => sum + getTestBytes(t), 0);

  const scanStorage = async () => {
    setBusyStorage(true);
    setStorageError('');
    try {
      const data = await requestJson<Inventory>('/api/admin/storage-usage', {}, () => auth.currentUser);
      setInventory(data);
    } catch (e) {
      setStorageError((e as Error).message || 'Failed to inspect Cloud Storage.');
    } finally {
      setBusyStorage(false);
    }
  };

  const measureBatch = async (targets: TestMeta[]) => {
    if (!targets.length || busyMeasure) return;
    setBusyMeasure(true);
    setMeasureErrors([]);
    setMeasureSuccess('');

    const failed: TestError[] = [];
    let completed = 0;

    for (let i = 0; i < targets.length; i++) {
      const test = targets[i];
      setMeasureProgress(`Measuring ${i + 1} / ${targets.length}: "${test.title || test.id}"…`);
      try {
        const full = await firestoreAdapter.getTestComplete(test.id);
        const size = new TextEncoder().encode(JSON.stringify(full)).length;
        await firestoreAdapter.updateTestMeta(test.id, { contentBytes: size });
        setMeasured((prev) => ({ ...prev, [test.id]: size }));
        completed++;
      } catch (e) {
        console.error(`Failed to measure test ${test.id}:`, e);
        failed.push({
          id: test.id,
          title: test.title || test.id,
          error: (e as Error).message || 'Failed to read or save test content',
        });
      }
    }

    setMeasureErrors(failed);
    setBusyMeasure(false);
    setMeasureProgress('');
    if (completed > 0) {
      setMeasureSuccess(
        `Successfully measured and saved ${completed} test${completed > 1 ? 's' : ''} to Firestore.` +
          (failed.length ? ` (${failed.length} failed)` : '')
      );
    }
  };

  return (
    <section className="studio-panel storage-overview">
      <div className="storage-heading">
        <div>
          <h2>
            <HardDrive size={22} /> Resource storage
          </h2>
          <p>Inspect Cloud Storage media assets and Firestore test document usage.</p>
        </div>
        <button
          className="studio-secondary"
          disabled={busyStorage || busyMeasure}
          onClick={() => void scanStorage()}
        >
          <RefreshCw size={16} className={busyStorage ? 'animate-spin' : ''} />
          {busyStorage ? 'Checking storage…' : 'Check uploaded files'}
        </button>
      </div>

      <div className="storage-stats">
        <div>
          <small>Cloud Storage (Uploaded media & files)</small>
          <strong>{inventory ? formatBytes(inventory.bytes) : 'Not checked'}</strong>
          <span>
            {inventory
              ? `${inventory.count} files${inventory.truncated ? ' · partial scan (limit)' : ''}`
              : 'Firebase Storage bucket: gen-lang-client-0464915880.firebasestorage.app'}
          </span>
        </div>
        <div>
          <small>Cloud Firestore (Test content estimate)</small>
          <strong>{known.length ? formatBytes(totalContentBytes) : 'Not measured'}</strong>
          <span>
            {known.length} / {tests.length} tests measured
            {unmeasured.length > 0 ? ` · ${unmeasured.length} unmeasured` : ' · all measured'}
          </span>
        </div>
      </div>

      <p>
        <strong>Cloud Storage</strong> holds media files (listening audio, passage diagrams) stored in Firebase Storage.
        <strong>Cloud Firestore</strong> stores passages, questions, and solutions in database documents. Measuring test
        content computes the UTF-8 payload size and persists <code>contentBytes</code> to Firestore so future views require
        zero database reads.
      </p>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
        {unmeasured.length > 0 ? (
          <button
            className="quiet-button"
            disabled={busyMeasure || busyStorage}
            onClick={() => void measureBatch(unmeasured)}
          >
            {known.length === 0
              ? 'Measure existing test content'
              : `Measure unmeasured tests (${unmeasured.length} remaining)`}
          </button>
        ) : (
          <button
            className="quiet-button"
            disabled={busyMeasure || busyStorage}
            onClick={() => void measureBatch(tests)}
          >
            Re-measure all tests ({tests.length})
          </button>
        )}

        {known.length > 0 && unmeasured.length > 0 && (
          <button
            className="quiet-button"
            disabled={busyMeasure || busyStorage}
            onClick={() => void measureBatch(tests)}
          >
            Re-measure all ({tests.length})
          </button>
        )}

        {measureErrors.length > 0 && (
          <button
            className="quiet-button"
            style={{ color: '#c0392b' }}
            disabled={busyMeasure || busyStorage}
            onClick={() => {
              const failedTargets = tests.filter((t) => measureErrors.some((e) => e.id === t.id));
              void measureBatch(failedTargets);
            }}
          >
            Retry failed tests ({measureErrors.length})
          </button>
        )}

        <small>Runs only when clicked; reads test sections and keys once, then saves the estimate to Firestore.</small>
      </div>

      {measureProgress && <p role="status">{measureProgress}</p>}
      {busyStorage && !measureProgress && <p role="status">Checking Cloud Storage bucket…</p>}

      {storageError && (
        <div role="alert" style={{ marginTop: '14px', padding: '12px', background: '#fdf2f2', border: '1px solid #f5c6cb', borderRadius: '10px', color: '#721c24' }}>
          <strong>Cloud Storage unavailable: </strong>
          <span>{storageError}</span>
        </div>
      )}

      {measureSuccess && (
        <p style={{ color: '#27ae60', marginTop: '10px' }}>
          <CheckCircle2 size={16} style={{ display: 'inline', verticalAlign: '-3px', marginRight: '4px' }} />
          {measureSuccess}
        </p>
      )}

      {measureErrors.length > 0 && (
        <div style={{ marginTop: '14px', padding: '12px', background: '#fff8f6', border: '1px solid #f5c2c7', borderRadius: '10px' }}>
          <strong style={{ color: '#c0392b' }}>
            <AlertCircle size={16} style={{ display: 'inline', verticalAlign: '-3px', marginRight: '4px' }} />
            {measureErrors.length} test{measureErrors.length > 1 ? 's' : ''} could not be measured:
          </strong>
          <ul style={{ margin: '8px 0 0 18px', padding: 0, fontSize: '12px', color: '#842029' }}>
            {measureErrors.map((err) => (
              <li key={err.id}>
                <strong>{err.title}</strong>: {err.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {inventory && (
        <>
          <label className="studio-field storage-rate">
            Your storage rate per GiB / month (optional)
            <input
              type="number"
              min="0"
              step="0.001"
              placeholder="Enter the rate from your Firebase bill"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </label>
          {rate !== '' && Number(rate) >= 0 && (
            <p>
              Uploaded file storage estimate:{' '}
              <strong>{((inventory.bytes / 1024 ** 3) * Number(rate)).toFixed(4)}</strong> / month, in your rate’s currency.
              Before allowances, taxes, downloads, and operations. This is not your Firebase bill.
            </p>
          )}
          <p>
            <small>
              Checked {new Date(inventory.scannedAt).toLocaleString()}
              {inventory.truncated ? ' · Scan limit reached; totals are a lower bound.' : ''}
              {inventory.bucket ? ` · Bucket: ${inventory.bucket}` : ''}
            </small>
          </p>
          <details>
            <summary>Largest uploaded files ({inventory.largest.length})</summary>
            <table className="studio-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {inventory.largest.map((file) => (
                  <tr key={file.name}>
                    <td>{file.name}</td>
                    <td>{formatBytes(file.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}

      {!!known.length && (
        <details>
          <summary>Storage by test ({known.length} measured)</summary>
          <table className="studio-table">
            <thead>
              <tr>
                <th>Test</th>
                <th>Content estimate</th>
              </tr>
            </thead>
            <tbody>
              {[...known]
                .sort((a, b) => getTestBytes(b) - getTestBytes(a))
                .map((test) => (
                  <tr key={test.id}>
                    <td>{test.title}</td>
                    <td>{formatBytes(getTestBytes(test))}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
