import Administradoras from './pages/Administradoras';
import ClienteDetalhes from './pages/ClienteDetalhes';
import Clientes from './pages/Clientes';
import Comissoes from './pages/Comissoes';
import Configuracoes from './pages/Configuracoes';
import Dashboard from './pages/Dashboard';
import Importacao from './pages/Importacao';
import ImportacaoDetalhes from './pages/ImportacaoDetalhes';
import MeusDados from './pages/MeusDados';
import PlanosConsorcio from './pages/PlanosConsorcio';
import RecebimentoComissao from './pages/RecebimentoComissao';
import Relatorios from './pages/Relatorios';
import Saques from './pages/Saques';
import TabelasConsorcio from './pages/TabelasConsorcio';
import Usuarios from './pages/Usuarios';
import VendaDetalhes from './pages/VendaDetalhes';
import Vendas from './pages/Vendas';
import FunilVendas from './pages/FunilVendas';
import ConfiguracaoFunil from './pages/ConfiguracaoFunil';
import OportunidadeDetalhes from './pages/OportunidadeDetalhes';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Administradoras": Administradoras,
    "ClienteDetalhes": ClienteDetalhes,
    "Clientes": Clientes,
    "Comissoes": Comissoes,
    "Configuracoes": Configuracoes,
    "Dashboard": Dashboard,
    "Importacao": Importacao,
    "ImportacaoDetalhes": ImportacaoDetalhes,
    "MeusDados": MeusDados,
    "PlanosConsorcio": PlanosConsorcio,
    "RecebimentoComissao": RecebimentoComissao,
    "Relatorios": Relatorios,
    "Saques": Saques,
    "TabelasConsorcio": TabelasConsorcio,
    "Usuarios": Usuarios,
    "VendaDetalhes": VendaDetalhes,
    "Vendas": Vendas,
    "FunilVendas": FunilVendas,
    "ConfiguracaoFunil": ConfiguracaoFunil,
    "OportunidadeDetalhes": OportunidadeDetalhes,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};