import {useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, Copy, X, ZoomIn} from 'lucide-react';
import {albums, sheets, type Capture} from './catalogo';
import './albums.css';

const number = (value: number) => String(value).padStart(2, '0');

function Photograph({capture, index, onOpen}: {capture: Capture; index: number; onOpen: () => void}) {
  return <figure className="ark-albums-photo">
    <button type="button" onClick={onOpen} aria-label={'Ampliar captura. ' + capture.alt}>
      <img src={capture.image} alt={capture.alt}/>
      <ZoomIn size={19} aria-hidden="true"/>
    </button>
    <figcaption>
      <span className="ark-albums-photo-number">{number(index)}</span>
      {capture.source
        ? <a href={capture.source} target="_blank" rel="noopener">{capture.caption}</a>
        : capture.caption}
    </figcaption>
  </figure>;
}

function LovableRequest({message}: {message: string}) {
  const [status, setStatus] = useState('');
  const details = useRef<HTMLDetailsElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);

  async function copyRequest() {
    try {
      await navigator.clipboard.writeText(message);
      setStatus('Copiado! Cole no chat do Lovable.');
    } catch {
      if (details.current) details.current.open = true;
      text.current?.focus();
      text.current?.select();
      setStatus('O texto está selecionado. Copie e cole no chat do Lovable.');
    }
  }

  return <section className="ark-albums-request" aria-label="Usar esta ideia no Lovable">
    <div className="ark-albums-request-heading">
      <div>
        <h2>Quer usar esta ideia?</h2>
        <p>Copie o pedido e cole no chat do seu projeto no Lovable.</p>
      </div>
      <button type="button" className="ark-albums-copy" onClick={() => void copyRequest()}>
        {status.startsWith('Copiado') ? <Check size={18} aria-hidden="true"/> : <Copy size={18} aria-hidden="true"/>}
        Copiar pedido para o Lovable
      </button>
    </div>
    <p role="status" className="ark-albums-copy-status">{status}</p>
    <details ref={details} className="ark-albums-recipe">
      <summary>Ver o pedido<ChevronDown size={16} aria-hidden="true"/></summary>
      <textarea ref={text} value={message} aria-label="Pedido para o Lovable" rows={5} readOnly/>
    </details>
  </section>;
}

export default function Albums() {
  const [page, setPage] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState<Capture | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const lightbox = useRef<HTMLDialogElement>(null);
  const sheet = sheets.find(entry => entry.id === page);
  const album = albums.find(item => item.id === sheet?.album);
  const pages = sheets.filter(entry => entry.album === album?.id);
  const current = pages.findIndex(entry => entry.id === page);
  const previous = pages[current - 1];
  const next = pages[current + 1];

  function turn(id: string | null) {
    setPage(id);
    window.requestAnimationFrame(() => {
      window.scrollTo({top: 0, behavior: 'instant'});
      heading.current?.focus({preventScroll: true});
    });
  }

  function openPhoto(capture: Capture) {
    setEnlarged(capture);
    lightbox.current?.showModal();
  }

  return <main className="ark-albums" aria-labelledby="albums-title">
    {!sheet || !album ? <>
      <header className="ark-albums-heading">
        <p className="ark-albums-kicker"><BookOpen size={16} aria-hidden="true"/> Biblioteca do SDR</p>
        <h1 id="albums-title" tabIndex={-1} ref={heading}>Álbum de projetos</h1>
        <p>Escolha uma ideia, veja como funciona e copie o pedido para o Lovable.</p>
      </header>
      <div className="ark-albums-shelf">
        {albums.map((item, index) => {
          const entries = sheets.filter(entry => entry.album === item.id);
          return <button key={item.id} type="button" className={'ark-albums-cover ' + item.id}
            onClick={() => turn(entries[0].id)} aria-label={'Abrir álbum ' + item.title}>
            <span className="ark-albums-cover-index">Álbum {number(index + 1)}</span>
            <span className="ark-albums-cover-name">{item.title}</span>
            <span className="ark-albums-cover-art" aria-hidden="true">
              {item.cover.map(image => <span key={image}><img src={image} alt=""/></span>)}
            </span>
            <span className="ark-albums-cover-footer">
              <span>{entries.map(entry => entry.title).join(' · ')}</span>
              <ArrowUpRight size={21} aria-hidden="true"/>
            </span>
          </button>;
        })}
      </div>
    </> : <>
      <nav className="ark-albums-trail" aria-label="Localização no álbum">
        <button type="button" className="ark-albums-link" onClick={() => turn(null)}><ArrowLeft size={16} aria-hidden="true"/>Todos os álbuns</button>
        <span>{album.title} <span aria-hidden="true">/</span> {number(current + 1)} de {number(pages.length)}</span>
      </nav>
      <nav className="ark-albums-index" aria-label="Escolher uma ficha">
        {pages.map(entry => <button type="button" key={entry.id} aria-current={entry.id === sheet.id ? 'page' : undefined}
          onClick={() => turn(entry.id)}>{entry.title}</button>)}
      </nav>
      <header className="ark-albums-project-heading">
        <p className="ark-albums-kicker">{sheet.album === 'skills' ? 'Skill do SDR' : 'Aplicação sugerida'}</p>
        <h1 id="albums-title" tabIndex={-1} ref={heading}>{sheet.title}</h1>
        <p>{sheet.summary}</p>
      </header>
      <LovableRequest key={`request-${sheet.id}`} message={`Leia src/albums/receitas/${sheet.recipe}. ${sheet.prompt} Mostre a prévia e me explique onde faço os ajustes.`}/>
      <article className="ark-albums-book" key={`book-${sheet.id}`} aria-label={'Páginas do projeto ' + sheet.title}>
        <div className="ark-albums-leaf ark-albums-leaf-left">
          <p className="ark-albums-kicker">Em imagens</p>
          <Photograph capture={sheet.captures[0]} index={1} onOpen={() => openPhoto(sheet.captures[0])}/>
        </div>
        <div className="ark-albums-leaf ark-albums-leaf-right">
          <p className="ark-albums-kicker">{sheet.captures.length > 1 ? 'Por dentro do SDR' : 'Como usar'}</p>
          {sheet.captures.slice(1).map((capture, index) => <Photograph key={capture.image} capture={capture} index={index + 2} onOpen={() => openPhoto(capture)}/>)}
          {sheet.captures.length === 1 && <ol className="ark-albums-steps">
            {sheet.steps.map(step => <li key={step.title}><h2>{step.title}</h2><p>{step.detail}</p></li>)}
          </ol>}
        </div>
      </article>
      <nav className="ark-albums-turn" aria-label="Folhear os projetos">
        {previous && <button type="button" className="ark-albums-link" onClick={() => turn(previous.id)}><ArrowLeft size={18} aria-hidden="true"/>{previous.title}</button>}
        {next && <button type="button" className="ark-albums-link ark-albums-next" onClick={() => turn(next.id)}>{next.title}<ArrowRight size={18} aria-hidden="true"/></button>}
      </nav>
      {sheet.captures.length > 1 && <ol className="ark-albums-steps ark-albums-steps-grid">
        {sheet.steps.map(step => <li key={step.title}><h2>{step.title}</h2><p>{step.detail}</p></li>)}
      </ol>}
      <p className="ark-albums-note">{sheet.note}</p>
    </>}
    <dialog className="ark-albums-lightbox" ref={lightbox} onClose={() => setEnlarged(null)} aria-label="Captura ampliada">
      <form method="dialog">
        <button type="submit" aria-label="Fechar captura"><X size={24} aria-hidden="true"/></button>
      </form>
      {enlarged && <figure>
        <img src={enlarged.image} alt={enlarged.alt}/>
        <figcaption>{enlarged.caption}</figcaption>
      </figure>}
    </dialog>
  </main>;
}
