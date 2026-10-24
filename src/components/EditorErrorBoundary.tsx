import React from 'react';
interface Props {children:React.ReactNode;testId:string;title:string;onBack:()=>void}
export class EditorErrorBoundary extends React.Component<Props,{error:Error|null}>{
 state:{error:Error|null}={error:null};
 static getDerivedStateFromError(error:Error){return {error}}
 componentDidUpdate(previous:Props){if(previous.testId!==this.props.testId&&this.state.error)this.setState({error:null})}
 render(){
  if(!this.state.error)return this.props.children;
  return <section className="studio-panel editor-load-error" role="alert"><span className="studio-eyebrow">TEST EDITOR</span><h1>Could not open this editor</h1><p>{this.props.title} · Test ID: <code>{this.props.testId}</code></p><p>Your saved test has not been changed. Reload to try opening the latest editor.</p><details open><summary>Error details</summary><pre>{this.state.error.message}</pre></details><div className="studio-actions"><button className="studio-primary" onClick={()=>window.location.reload()}>Reload editor</button><button className="studio-secondary" onClick={this.props.onBack}>Back to tests</button></div></section>;
 }
}
