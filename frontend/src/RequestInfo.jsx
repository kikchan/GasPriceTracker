export default function RequestInfo({ url }) {
  return (
    <div className="status-card">
      <strong>Request URL</strong>
      <p>{url}</p>
    </div>
  );
}
