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
import Bancos from './pages/Bancos';
import BatePapo from './pages/BatePapo';
import CartasContempladas from './pages/CartasContempladas';
import ClienteDetalhes from './pages/ClienteDetalhes';
import Clientes from './pages/Clientes';
import ComissaoPagar from './pages/ComissaoPagar';
import Comissoes from './pages/Comissoes';
import ComissoesPagar from './pages/ComissoesPagar';
import ComissoesPagas from './pages/ComissoesPagas';
import ComissoesRecebidas from './pages/ComissoesRecebidas';
import ConfiguracaoFunil from './pages/ConfiguracaoFunil';
import ConfiguracaoWhatsApp from './pages/ConfiguracaoWhatsApp';
import Configuracoes from './pages/Configuracoes';
import Convenios from './pages/Convenios';
import Dashboard from './pages/Dashboard';
import EmpresasParceiras from './pages/EmpresasParceiras';
import FunilVendas from './pages/FunilVendas';
import GestaoSubcontas from './pages/GestaoSubcontas';
import HistoricoImportacao from './pages/HistoricoImportacao';
import HistoricoResultadoAssembleia from './pages/HistoricoResultadoAssembleia';
import Importacao from './pages/Importacao';
import ImportacaoComissao from './pages/ImportacaoComissao';
import ImportacaoDetalhes from './pages/ImportacaoDetalhes';
import ImportacaoPlanos from './pages/ImportacaoPlanos';
import ImportacaoProducao from './pages/ImportacaoProducao';
import ImportarPlanosPrint from './pages/ImportarPlanosPrint';
import ImportarResultadoAssembleia from './pages/ImportarResultadoAssembleia';
import ImprimirSimulacao from './pages/ImprimirSimulacao';
import LancamentoDespesas from './pages/LancamentoDespesas';
import LancamentoReceitas from './pages/LancamentoReceitas';
import LogsRecebimento from './pages/LogsRecebimento';
import MeusDados from './pages/MeusDados';
import NovaVenda from './pages/NovaVenda';
import NovaVendaConsignado from './pages/NovaVendaConsignado';
import NovaVendaEmprestimo from './pages/NovaVendaEmprestimo';
import NovaVendaEmprestimoPessoal from './pages/NovaVendaEmprestimoPessoal';
import NovaVendaFinanciamento from './pages/NovaVendaFinanciamento';
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
import StatusPropostas from './pages/StatusPropostas';
import SyncTests from './pages/SyncTests';
import TabelasComissaoEmprestimo from './pages/TabelasComissaoEmprestimo';
import TabelasConsorcio from './pages/TabelasConsorcio';
import TabelasEmprestimo from './pages/TabelasEmprestimo';
import TesteWhatsApp from './pages/TesteWhatsApp';
import Usuarios from './pages/Usuarios';
import VendaDetalhes from './pages/VendaDetalhes';
import VendaEmprestimoDetalhes from './pages/VendaEmprestimoDetalhes';
import Vendas from './pages/Vendas';
import VendasEmprestimos from './pages/VendasEmprestimos';
import VendasFinanciamento from './pages/VendasFinanciamento';
import Propostas from './pages/Propostas';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Administradoras": Administradoras,
    "Agenda": Agenda,
    "Bancos": Bancos,
    "BatePapo": BatePapo,
    "CartasContempladas": CartasContempladas,
    "ClienteDetalhes": ClienteDetalhes,
    "Clientes": Clientes,
    "ComissaoPagar": ComissaoPagar,
    "Comissoes": Comissoes,
    "ComissoesPagar": ComissoesPagar,
    "ComissoesPagas": ComissoesPagas,
    "ComissoesRecebidas": ComissoesRecebidas,
    "ConfiguracaoFunil": ConfiguracaoFunil,
    "ConfiguracaoWhatsApp": ConfiguracaoWhatsApp,
    "Configuracoes": Configuracoes,
    "Convenios": Convenios,
    "Dashboard": Dashboard,
    "EmpresasParceiras": EmpresasParceiras,
    "FunilVendas": FunilVendas,
    "GestaoSubcontas": GestaoSubcontas,
    "HistoricoImportacao": HistoricoImportacao,
    "HistoricoResultadoAssembleia": HistoricoResultadoAssembleia,
    "Importacao": Importacao,
    "ImportacaoComissao": ImportacaoComissao,
    "ImportacaoDetalhes": ImportacaoDetalhes,
    "ImportacaoPlanos": ImportacaoPlanos,
    "ImportacaoProducao": ImportacaoProducao,
    "ImportarPlanosPrint": ImportarPlanosPrint,
    "ImportarResultadoAssembleia": ImportarResultadoAssembleia,
    "ImprimirSimulacao": ImprimirSimulacao,
    "LancamentoDespesas": LancamentoDespesas,
    "LancamentoReceitas": LancamentoReceitas,
    "LogsRecebimento": LogsRecebimento,
    "MeusDados": MeusDados,
    "NovaVenda": NovaVenda,
    "NovaVendaConsignado": NovaVendaConsignado,
    "NovaVendaEmprestimo": NovaVendaEmprestimo,
    "NovaVendaEmprestimoPessoal": NovaVendaEmprestimoPessoal,
    "NovaVendaFinanciamento": NovaVendaFinanciamento,
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
    "StatusPropostas": StatusPropostas,
    "SyncTests": SyncTests,
    "TabelasComissaoEmprestimo": TabelasComissaoEmprestimo,
    "TabelasConsorcio": TabelasConsorcio,
    "TabelasEmprestimo": TabelasEmprestimo,
    "TesteWhatsApp": TesteWhatsApp,
    "Usuarios": Usuarios,
    "VendaDetalhes": VendaDetalhes,
    "VendaEmprestimoDetalhes": VendaEmprestimoDetalhes,
    "Vendas": Vendas,
    "VendasEmprestimos": VendasEmprestimos,
    "VendasFinanciamento": VendasFinanciamento,
    "Propostas": Propostas,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};