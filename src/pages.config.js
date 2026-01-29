/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Administradoras from './pages/Administradoras';
import Agenda from './pages/Agenda';
import ClienteDetalhes from './pages/ClienteDetalhes';
import Clientes from './pages/Clientes';
import ComissaoPagar from './pages/ComissaoPagar';
import Comissoes from './pages/Comissoes';
import ComissoesPagar from './pages/ComissoesPagar';
import ComissoesPagas from './pages/ComissoesPagas';
import ComissoesRecebidas from './pages/ComissoesRecebidas';
import ConfiguracaoFunil from './pages/ConfiguracaoFunil';
import Configuracoes from './pages/Configuracoes';
import Dashboard from './pages/Dashboard';
import Empresas from './pages/Empresas';
import FunilVendas from './pages/FunilVendas';
import Importacao from './pages/Importacao';
import ImportacaoComissao from './pages/ImportacaoComissao';
import ImportacaoDetalhes from './pages/ImportacaoDetalhes';
import ImportacaoPlanos from './pages/ImportacaoPlanos';
import ImportacaoProducao from './pages/ImportacaoProducao';
import ImportarPlanosPrint from './pages/ImportarPlanosPrint';
import ImprimirSimulacao from './pages/ImprimirSimulacao';
import LancamentoDespesas from './pages/LancamentoDespesas';
import LancamentoReceitas from './pages/LancamentoReceitas';
import MeusDados from './pages/MeusDados';
import OfertaLance from './pages/OfertaLance';
import OportunidadeDetalhes from './pages/OportunidadeDetalhes';
import PlanosCanopus from './pages/PlanosCanopus';
import PlanosConsorcio from './pages/PlanosConsorcio';
import RecebimentoComissao from './pages/RecebimentoComissao';
import Relatorios from './pages/Relatorios';
import RelatoriosFinanceiros from './pages/RelatoriosFinanceiros';
import Saques from './pages/Saques';
import SimuladorConsorcio from './pages/SimuladorConsorcio';
import SimuladorEscolha from './pages/SimuladorEscolha';
import SimuladorNormal from './pages/SimuladorNormal';
import SyncTests from './pages/SyncTests';
import TabelasConsorcio from './pages/TabelasConsorcio';
import Usuarios from './pages/Usuarios';
import VendaDetalhes from './pages/VendaDetalhes';
import Vendas from './pages/Vendas';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Administradoras": Administradoras,
    "Agenda": Agenda,
    "ClienteDetalhes": ClienteDetalhes,
    "Clientes": Clientes,
    "ComissaoPagar": ComissaoPagar,
    "Comissoes": Comissoes,
    "ComissoesPagar": ComissoesPagar,
    "ComissoesPagas": ComissoesPagas,
    "ComissoesRecebidas": ComissoesRecebidas,
    "ConfiguracaoFunil": ConfiguracaoFunil,
    "Configuracoes": Configuracoes,
    "Dashboard": Dashboard,
    "Empresas": Empresas,
    "FunilVendas": FunilVendas,
    "Importacao": Importacao,
    "ImportacaoComissao": ImportacaoComissao,
    "ImportacaoDetalhes": ImportacaoDetalhes,
    "ImportacaoPlanos": ImportacaoPlanos,
    "ImportacaoProducao": ImportacaoProducao,
    "ImportarPlanosPrint": ImportarPlanosPrint,
    "ImprimirSimulacao": ImprimirSimulacao,
    "LancamentoDespesas": LancamentoDespesas,
    "LancamentoReceitas": LancamentoReceitas,
    "MeusDados": MeusDados,
    "OfertaLance": OfertaLance,
    "OportunidadeDetalhes": OportunidadeDetalhes,
    "PlanosCanopus": PlanosCanopus,
    "PlanosConsorcio": PlanosConsorcio,
    "RecebimentoComissao": RecebimentoComissao,
    "Relatorios": Relatorios,
    "RelatoriosFinanceiros": RelatoriosFinanceiros,
    "Saques": Saques,
    "SimuladorConsorcio": SimuladorConsorcio,
    "SimuladorEscolha": SimuladorEscolha,
    "SimuladorNormal": SimuladorNormal,
    "SyncTests": SyncTests,
    "TabelasConsorcio": TabelasConsorcio,
    "Usuarios": Usuarios,
    "VendaDetalhes": VendaDetalhes,
    "Vendas": Vendas,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};