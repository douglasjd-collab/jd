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
import ImportacaoDetalhes from './pages/ImportacaoDetalhes';
import ImportarPlanosPrint from './pages/ImportarPlanosPrint';
import ImprimirSimulacao from './pages/ImprimirSimulacao';
import LancamentoDespesas from './pages/LancamentoDespesas';
import LancamentoReceitas from './pages/LancamentoReceitas';
import MeusDados from './pages/MeusDados';
import OfertaLance from './pages/OfertaLance';
import OportunidadeDetalhes from './pages/OportunidadeDetalhes';
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
    "ImportacaoDetalhes": ImportacaoDetalhes,
    "ImportarPlanosPrint": ImportarPlanosPrint,
    "ImprimirSimulacao": ImprimirSimulacao,
    "LancamentoDespesas": LancamentoDespesas,
    "LancamentoReceitas": LancamentoReceitas,
    "MeusDados": MeusDados,
    "OfertaLance": OfertaLance,
    "OportunidadeDetalhes": OportunidadeDetalhes,
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