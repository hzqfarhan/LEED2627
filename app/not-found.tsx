import Link from 'next/link';
import OopsScreen from '@/components/OopsScreen';

export default function NotFound() {
  return (
    <OopsScreen
      art="map"
      title="This page is not on the map"
      actions={
        <>
          <Link className="btn btn--go" href="/stalls">
            Browse the stalls
          </Link>
          <Link className="btn btn--line" href="/map">
            Open the venue map
          </Link>
          <Link className="btn btn--line" href="/">
            Home
          </Link>
        </>
      }
    >
      <p>The link may be old, or the stall number may not exist. Find the stall from the list or the map instead.</p>
    </OopsScreen>
  );
}
