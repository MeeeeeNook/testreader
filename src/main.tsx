import {canonicalSiteLocation} from './services/siteOrigins';
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const destination=canonicalSiteLocation(window.location.hostname,window.location.pathname,window.location.search);
if(destination)window.location.replace(destination);
else createRoot(document.getElementById("root")!).render(<App />);

import "./studio-refresh.css";

import "./portal.css";


import "./admin.css";

import "./reader.css";
import "./polish.css";

import "./reader-refinement.css";

import "./listening-polish.css";

import "./website-ui.css";

import './history-analytics.css';

import './admin-workspace.css';

import './student-experience.css';
