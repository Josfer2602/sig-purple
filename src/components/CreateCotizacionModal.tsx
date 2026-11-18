import React, { useState } from 'react';
import { useGlobalContext } from '../context/GlobalContext';
import toast from 'react-hot-toast';

interface CreateCotizacionModalProps {
  onClose: () => void;
  onSubmit: (projectId: string, quoteName: string) => void;
}

export const CreateCotizacionModal: React.FC<CreateCotizacionModalProps> = ({ onClose, onSubmit }) => {
  const { proyectos } = useGlobalContext();
  const [projectId, setProjectId] = useState<string>('');
  const [quoteName, setQuoteName] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) {
      toast.error('Debe seleccionar un proyecto.');
      return;
    }
    if (!quoteName.trim()) {
      toast.error('Debe ingresar un nombre para la cotización.');
      return;
    }
    onSubmit(projectId, quoteName);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
          <h2 className="text-xl font-bold text-gray-800">Nueva Cotización</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <form id="createQuoteForm" onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Asignar a Proyecto *
              </label>
              <select
                required
                className="w-full border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">-- Seleccionar Proyecto --</option>
                {proyectos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre de la Cotización *
              </label>
              <input
                required
                type="text"
                placeholder="Ej. Diseño de Interfaz"
                className="w-full border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                value={quoteName}
                onChange={(e) => setQuoteName(e.target.value)}
              />
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors font-medium"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="createQuoteForm"
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm font-medium"
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
};
