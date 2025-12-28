import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import Usuarios from './pages/Usuarios';
import Administradoras from './pages/Administradoras';
import TabelasConsorcio from './pages/TabelasConsorcio';
import PlanosConsorcio from './pages/PlanosConsorcio';
import Vendas from './pages/Vendas';
import VendaDetalhes from './pages/VendaDetalhes';
import Importacao from './pages/Importacao';
import ImportacaoDetalhes from './pages/ImportacaoDetalhes';
import Comissoes from './pages/Comissoes';
import Relatorios from './pages/Relatorios';
import Configuracoes from './pages/Configuracoes';
import ClienteDetalhes from './pages/ClienteDetalhes';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Clientes": Clientes,
    "Usuarios": Usuarios,
    "Administradoras": Administradoras,
    "TabelasConsorcio": TabelasConsorcio,
    "PlanosConsorcio": PlanosConsorcio,
    "Vendas": Vendas,
    "VendaDetalhes": VendaDetalhes,
    "Importacao": Importacao,
    "ImportacaoDetalhes": ImportacaoDetalhes,
    "Comissoes": Comissoes,
    "Relatorios": Relatorios,
    "Configuracoes": Configuracoes,
    "ClienteDetalhes": ClienteDetalhes,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};