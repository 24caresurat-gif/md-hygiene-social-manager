'use client';
import AppShell from '../../components/AppShell';

const features = [
  ["AI Auto Review Reply","Draft replies for unreplied Google reviews.","/dashboard/gmb/ai"],
  ["AI Manages Facebook and Instagram Posts","AI captions, rewrites and hashtags.","/dashboard/publish"],
  ["Lead Capture Form","Create a lead-focused customer form.","/dashboard/gmb/leads"],
  ["AI Form Review Suggestion","Generate responses from form feedback.","/dashboard/gmb/responses"],
  ["Market Comparison","Compare your rating with an editable benchmark.","/dashboard/gmb/market"],
  ["Add Google Review","Create customer review-request links.","/dashboard/gmb/requests"],
  ["Custom Feedback Form","Build custom workspace feedback forms.","/dashboard/gmb/forms"],
  ["Rating Improvement Suggestions","Turn review patterns into actions.","/dashboard/gmb/rating-improvement"],
  ["Review Status Dashboard","See replied, pending and low-rating status.","/dashboard/gmb/status"],
  ["Custom AI Review Suggestion Form","Create an AI-enabled feedback form preset.","/dashboard/gmb/ai-review-form"],
  ["AI Manages Google Posts","AI-assisted Google Business post drafting.","/dashboard/gmb/posts"],
  ["Negative Review FeedBack","Monitor low-rating feedback and protection.","/dashboard/gmb/negative-feedback"],
  ["Review Management","Review inbox, filters, drafts and replies.","/dashboard/gmb/reviews"],
  ["Auto Reviews Suggestion","Quick AI or fallback review suggestions.","/dashboard/gmb/reviews"],
  ["Business-Specific AI Reviews","Use saved business context in AI replies.","/dashboard/settings#review-ai"],
  ["Keywords Management","Manage response keywords by workspace.","/dashboard/gmb/keywords"],
  ["Google My Business Management","Manage location details and state.","/dashboard/gmb/management"],
  ["AI Business Insights","Analyze review and feedback signals.","/dashboard/gmb/ai"]
];

export default function GMBFeaturesPage(){
  return <AppShell title="GMB Features"><style jsx>{`.page{display:grid;gap:15px}.hero{padding:20px}.hero h1{margin:5px 0}.note{font-size:10px;color:#667085;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.card{padding:16px;min-height:160px;display:grid;gap:8px}.tag{font-size:8px;font-weight:900;padding:4px 7px;border-radius:999px;background:#f1f5f7;width:max-content}.btn{width:max-content;border:1px solid #dbe4e8;background:#fff;border-radius:9px;padding:9px 11px;font-size:9px;font-weight:900;cursor:pointer}@media(max-width:1000px){.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.grid{grid-template-columns:1fr}}`}</style><div className="page"><section className="panel hero"><div className="eyebrow">REPUTATION + AI</div><h1>All Requested Features</h1><p className="note">All 18 requested features are organized here and remain workspace-scoped. External Facebook, Instagram and Google connections stay in Settings.</p></section><section className="grid">{features.map(([title,description,href])=><article className="panel card" key={title}><span className="tag">FEATURE</span><h2 style={{margin:0,fontSize:14}}>{title}</h2><p className="note">{description}</p><button className="btn" onClick={()=>location.href=href}>Open Feature →</button></article>)}</section></div></AppShell>
}
