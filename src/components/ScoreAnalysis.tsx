import React from 'react';
import type {ScoreResult} from '../types';
import {scoreInsights} from '../services/scoring';
export function ScoreAnalysis({result,skill}:{result:ScoreResult;skill:'reading'|'listening'}){
 const data=scoreInsights(result,skill);
 return <details className="score-analysis"><summary>How this estimate is calculated</summary><p>Each correct answer earns one mark. Blank and incorrect answers earn zero. We convert a complete, fully marked 40-question test using the {skill==='listening'?'Listening':'Academic Reading'} raw-score table. Partial tests and tests with missing keys receive a raw score only.</p><dl><div><dt>Accuracy</dt><dd>{data.accuracy===null?'—':(data.accuracy*100).toFixed(1)+'%'}</dd></div><div><dt>Answer completion</dt><dd>{data.completion===null?'—':(data.completion*100).toFixed(1)+'%'}</dd></div>{data.nextBand&&<div><dt>Next estimated band {data.nextBand.band.toFixed(1)}</dt><dd>{data.nextBand.needed} more correct answer(s)</dd></div>}</dl><p>Band thresholds can vary slightly between official test versions. Time, playback speed, and practice mode do not change the raw-score conversion. This is a practice estimate, not an official IELTS result.</p><a href="https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail" target="_blank" rel="noreferrer">IELTS scoring explanation</a></details>;
}
