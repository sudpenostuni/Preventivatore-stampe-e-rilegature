import type { PutBlobResult } from '@vercel/blob';
import { useState, useRef } from 'react';
import { Upload, X } from 'lucide-react';

export default function AvatarUploadPage() {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [blob, setBlob] = useState<PutBlobResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-4xl p-6 card-shadow space-y-6 border border-gray-100">
      <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <Upload size={24} className="text-brandBlue" />
        Carica Immagine
      </h2>

      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);

          if (!inputFileRef.current?.files?.length) {
            setError("Seleziona un file prima di caricare.");
            return;
          }

          const file = inputFileRef.current.files[0];
          setUploading(true);

          try {
            const response = await fetch(
              `/api/avatar/upload?filename=${encodeURIComponent(file.name)}`,
              {
                method: 'POST',
                body: file,
              },
            );

            if (!response.ok) {
              throw new Error('Upload failed');
            }

            const newBlob = (await response.json()) as PutBlobResult;
            setBlob(newBlob);
          } catch (err) {
            console.error(err);
            setError("Errore durante il caricamento. Riprova.");
          } finally {
            setUploading(false);
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <input 
            name="file" 
            ref={inputFileRef} 
            type="file" 
            accept="image/jpeg, image/png, image/webp" 
            required 
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-brandBlue/10 file:text-brandBlue
              hover:file:bg-brandBlue/20
            "
          />
        </div>
        
        <button 
          type="submit" 
          disabled={uploading}
          className="w-full h-12 bg-brandBlue text-white rounded-xl font-bold text-sm uppercase flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
        >
          {uploading ? 'Caricamento...' : 'Carica Immagine'}
        </button>

        {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
      </form>

      {blob && (
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-2">
          <p className="text-xs font-bold text-gray-500 uppercase">Immagine Caricata:</p>
          <a href={blob.url} target="_blank" rel="noopener noreferrer" className="text-brandBlue text-sm font-medium break-all hover:underline block">
            {blob.url}
          </a>
          <div className="relative aspect-video rounded-lg overflow-hidden border border-gray-200 bg-white">
            <img src={blob.url} alt="Uploaded" className="object-contain w-full h-full" />
          </div>
          <button onClick={() => setBlob(null)} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 mt-2">
            <X size={12} /> Rimuovi anteprima
          </button>
        </div>
      )}
    </div>
  );
}
