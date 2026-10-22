import React, { useState } from "react";
import { UserProfile, AttemptRecord, VocabularyItem } from "../types";

interface SettingsViewProps {
  profile: UserProfile;
  attempts: AttemptRecord[];
  vocabulary: VocabularyItem[];
  isAdmin: boolean;
  onViewStudents: () => void;
  onUpdateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  onExportTestBank: () => void;
  onOpenUpload: () => void;
  onNotify: (msg: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  attempts,
  vocabulary,
  isAdmin,
  onViewStudents,
  onUpdateProfile,
  onExportTestBank,
  onOpenUpload,
  onNotify,
}) => {
  const [target, setTarget] = useState(profile.target);
  const [fontSize, setFontSize] = useState(profile.fontSize);



  const isVi = false;

  const handleSavePreferences = async () => {
    const numTarget = Number(target);
    if (isNaN(numTarget) || numTarget < 0 || numTarget > 9) {
      onNotify("Please choose a target band between 0 and 9.");
      return;
    }
    await onUpdateProfile({
      target: numTarget,
      fontSize: Number(fontSize),
      language: "en",
      theme: "light",
    });
    onNotify("Preferences saved.");
  };

  const handleExportStudyData = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      profile,
      attempts: attempts.filter((a) => a.owner === profile.id),
      vocabulary: vocabulary.filter((w) => w.owner === profile.id),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `My_IELTS_Study_Data_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    onNotify("Personal study backup downloaded.");
  };

  return (
    <div style={{ maxWidth: "850px", paddingBottom: "40px" }}>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">MAKE YOURSELF AT HOME</div>
          <h1 className="studio-heading">Your preferences.</h1>
          <p className="studio-lead">
            Configure your reading comfort, adjust your target IELTS score, and
            manage your portable test data.
          </p>
        </div>
      </div>

      <div className="studio-panel">
        <h3>Display & Study Preferences</h3>

        <div className="studio-form-grid">
          <label className="studio-field">
            Passage Font Size
            <select
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
            >
              <option value={14}>Small (14px)</option>
              <option value={16}>Default (16px)</option>
              <option value={18}>Large (18px)</option>
              <option value={20}>Extra Large (20px)</option>
            </select>
          </label>

          <label className="studio-field">
            Target IELTS Band (0 – 9)
            <input
              type="number"
              step="0.5"
              min="0"
              max="9"
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="studio-actions" style={{ marginTop: "16px" }}>
          <button className="studio-primary" onClick={handleSavePreferences}>
            Save Preferences
          </button>
        </div>
      </div>

      {isAdmin && (
        <section className="studio-panel">
          <h2>Teacher workspace</h2>
          <p>
            View your students and their synced attempts, scores, and answers.
          </p>
          <button className="studio-primary" onClick={onViewStudents}>
            Open Students
          </button>
        </section>
      )}
      <div className="studio-panel">
        <h3>Your Data, Your Ownership</h3>
        <p className="studio-lead">
          Completed test results are saved on this device first. Sign in to sync
          your history with your account. Session drafts stay on this device.
          You can export your study data below.
        </p>

        <div className="studio-actions" style={{ marginTop: "20px" }}>
          <button className="studio-secondary" onClick={handleExportStudyData}>
            Export My Study Data (JSON)
          </button>

          {isAdmin && (
            <>
              <button className="studio-secondary" onClick={onExportTestBank}>
                Export Entire Test Bank (Admin)
              </button>
              <button className="studio-secondary" onClick={onOpenUpload}>
                Import Tests (ZIP / HTML / JSON)
              </button>
            </>
          )}
        </div>

        <div className="studio-callout" style={{ marginTop: "24px" }}>
          <strong>Secure Administration & Isolation:</strong> Responses, notes,
          highlights, and vocabulary are strictly partitioned per user account
          in Firestore. Private answer keys are inaccessible to students before
          exam submission.
        </div>
      </div>
    </div>
  );
};

