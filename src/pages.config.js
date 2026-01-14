import Administradoras from './pages/Administradoras';
import ClienteDetalhes from './pages/ClienteDetalhes';
import Clientes from './pages/Clientes';
import ComissaoPagar from './pages/ComissaoPagar';
import Comissoes from './pages/Comissoes';
import ConfiguracaoFunil from './pages/ConfiguracaoFunil';
import Configuracoes from './pages/Configuracoes';
import Dashboard from './pages/Dashboard';
import Empresas from './pages/Empresas';
import FunilVendas from './pages/FunilVendas';
import Importacao from './pages/Importacao';
import ImportacaoDetalhes from './pages/ImportacaoDetalhes';
import ImprimirSimulacao from './pages/ImprimirSimulacao';
import MeusDados from './pages/MeusDados';
import OportunidadeDetalhes from './pages/OportunidadeDetalhes';
import PlanosConsorcio from './pages/PlanosConsorcio';
import RecebimentoComissao from './pages/RecebimentoComissao';
import Relatorios from './pages/Relatorios';
import Saques from './pages/Saques';
import SimuladorConsorcio from './pages/SimuladorConsorcio';
import SyncTests from './pages/SyncTests';
import TabelasConsorcio from './pages/TabelasConsorcio';
import Usuarios from './pages/Usuarios';
import VendaDetalhes from './pages/VendaDetalhes';
import Vendas from './pages/Vendas';
import OfertaLance from './pages/OfertaLance';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Administradoras": Administradoras,
    "ClienteDetalhes": ClienteDetalhes,
    "Clientes": Clientes,
    "ComissaoPagar": ComissaoPagar,
    "Comissoes": Comissoes,
    "ConfiguracaoFunil": ConfiguracaoFunil,
    "Configuracoes": Configuracoes,
    "Dashboard": Dashboard,
    "Empresas": Empresas,
    "FunilVendas": FunilVendas,
    "Importacao": Importacao,
    "ImportacaoDetalhes": ImportacaoDetalhes,
    "ImprimirSimulacao": ImprimirSimulacao,
    "MeusDados": MeusDados,
    "OportunidadeDetalhes": OportunidadeDetalhes,
    "PlanosConsorcio": PlanosConsorcio,
    "RecebimentoComissao": RecebimentoComissao,
    "Relatorios": Relatorios,
    "Saques": Saques,
    "SimuladorConsorcio": SimuladorConsorcio,
    "SyncTests": SyncTests,
    "TabelasConsorcio": TabelasConsorcio,
    "Usuarios": Usuarios,
    "VendaDetalhes": VendaDetalhes,
    "Vendas": Vendas,
    "OfertaLance": OfertaLance,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};