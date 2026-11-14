'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {ArrowLeft} from 'lucide-react';
import {Shell} from './Shell';
import './sdr-product.css';

const Product = dynamic(() => import('./demo-runtime/LabApp'), {
  ssr: false,
  loading: () => <p role="status">Abrindo o SDR Arkom…</p>,
});

// Preserve the existing Lovable product until its complete Flutter migration.
// Its API client reuses the portal session and same-origin Go proxy.
export default function SDRProduct() {
  return <Shell demo>
    <section className="arkom-demo" aria-label="Produto SDR Arkom">
      <header className="demo-topline">
        <Link href="/demo/team" className="inline-flex items-center gap-2">
          <ArrowLeft size={15}/> Voltar ao time
        </Link>
        <span>SDR Arkom · ambiente local</span>
      </header>
      <div className="demo-runtime sdr-product-runtime">
        <Product initialTab="whatsapp" productMode/>
      </div>
    </section>
  </Shell>;
}
