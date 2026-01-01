// src/app/saga/[sagaId]/page.tsx

import { SagaViewer } from '@/components/saga/SagaViewer';

export default function SagaPage({ params }: { params: { sagaId: string } }) {
  return <SagaViewer sagaId={params.sagaId} />;
}








