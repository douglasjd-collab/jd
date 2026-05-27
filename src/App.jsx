import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Tarefas from './pages/Tarefas';
import ConfiguracaoTarefas from './pages/ConfiguracaoTarefas';
import ContatosCRM from './pages/ContatosCRM';
import ConfiguracaoApi from './pages/ConfiguracaoApi';
import Adiantamentos from './pages/Adiantamentos';
import Campanhas from './pages/Campanhas';
import HistoricoImportacaoPropostas from './pages/HistoricoImportacaoPropostas';
import TesteWebhookWhatsApp from './pages/TesteWebhookWhatsApp';
import ExportarHistoricoConversa from './pages/ExportarHistoricoConversa';
import MonitorWebhookAgressivo from './pages/MonitorWebhookAgressivo';
import ComparadorMensagensEvolution from './pages/ComparadorMensagensEvolution';
import RastreadorMensagens from './pages/RastreadorMensagens';
import StatusRecebimentoMensagens from './pages/StatusRecebimentoMensagens';
import SincronizacaoAgressivaMensagens from './pages/SincronizacaoAgressivaMensagens';
import ConfiguracaoDuplaAPI from './pages/ConfiguracaoDuplaAPI';
import TabelasComissaoVendedor from './pages/TabelasComissaoVendedor';
import IntegracaoFinantoBank from './pages/IntegracaoFinantoBank';
import DebugFinanto from './pages/DebugFinanto';
import ReconectarWhatsApp from './pages/ReconectarWhatsApp';
import FuncionariosColaboradores from './pages/FuncionariosColaboradores';
import FolhaSalarialPage from './pages/FolhaSalarial';
import AdiantamentosFuncionarios from './pages/AdiantamentosFuncionarios';
import RelatorioFuncionarios from './pages/RelatorioFuncionarios';
import ContasBancarias from './pages/ContasBancarias';
import LancamentoFaltas from './pages/LancamentoFaltas';
import DashboardSeguros from './pages/DashboardSeguros';
import FinanciamentoVeiculos from './pages/FinanciamentoVeiculos';
import ConfiguracaoFunis from './pages/ConfiguracaoFunis';
import AutomacaoFunis from './pages/AutomacaoFunis';
import ConfiguracaoWhatsappPessoal from './pages/ConfiguracaoWhatsappPessoal';
import CallCenter from './pages/CallCenter';
import Seguros from './pages/Seguros';
import RenovacoesSeguro from './pages/RenovacoesSeguro';
import CobrancaSeguro from './pages/CobrancaSeguro';
import ConfiguracaoSeguros from './pages/ConfiguracaoSeguros';
import ConfiguracaoSetoresTarefas from './pages/ConfiguracaoSetoresTarefas';
import SimuladorInteligente from './pages/SimuladorInteligente';
import DiagnosticoNvoip from './pages/DiagnosticoNvoip';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/Tarefas" element={<LayoutWrapper currentPageName="Tarefas"><Tarefas /></LayoutWrapper>} />
      <Route path="/ConfiguracaoTarefas" element={<LayoutWrapper currentPageName="ConfiguracaoTarefas"><ConfiguracaoTarefas /></LayoutWrapper>} />
      <Route path="/ContatosCRM" element={<LayoutWrapper currentPageName="ContatosCRM"><ContatosCRM /></LayoutWrapper>} />
      <Route path="/ConfiguracaoApi" element={<LayoutWrapper currentPageName="ConfiguracaoApi"><ConfiguracaoApi /></LayoutWrapper>} />
      <Route path="/Adiantamentos" element={<LayoutWrapper currentPageName="Adiantamentos"><Adiantamentos /></LayoutWrapper>} />
      <Route path="/Campanhas" element={<LayoutWrapper currentPageName="Campanhas"><Campanhas /></LayoutWrapper>} />
      <Route path="/HistoricoImportacaoPropostas" element={<LayoutWrapper currentPageName="HistoricoImportacaoPropostas"><HistoricoImportacaoPropostas /></LayoutWrapper>} />
      <Route path="/TesteWebhookWhatsApp" element={<LayoutWrapper currentPageName="TesteWebhookWhatsApp"><TesteWebhookWhatsApp /></LayoutWrapper>} />
      <Route path="/ExportarHistoricoConversa" element={<LayoutWrapper currentPageName="ExportarHistoricoConversa"><ExportarHistoricoConversa /></LayoutWrapper>} />
      <Route path="/MonitorWebhookAgressivo" element={<LayoutWrapper currentPageName="MonitorWebhookAgressivo"><MonitorWebhookAgressivo /></LayoutWrapper>} />
      <Route path="/ComparadorMensagensEvolution" element={<LayoutWrapper currentPageName="ComparadorMensagensEvolution"><ComparadorMensagensEvolution /></LayoutWrapper>} />
      <Route path="/RastreadorMensagens" element={<LayoutWrapper currentPageName="RastreadorMensagens"><RastreadorMensagens /></LayoutWrapper>} />
      <Route path="/StatusRecebimentoMensagens" element={<LayoutWrapper currentPageName="StatusRecebimentoMensagens"><StatusRecebimentoMensagens /></LayoutWrapper>} />
      <Route path="/SincronizacaoAgressivaMensagens" element={<LayoutWrapper currentPageName="SincronizacaoAgressivaMensagens"><SincronizacaoAgressivaMensagens /></LayoutWrapper>} />
      <Route path="/ConfiguracaoDuplaAPI" element={<LayoutWrapper currentPageName="ConfiguracaoDuplaAPI"><ConfiguracaoDuplaAPI /></LayoutWrapper>} />
      <Route path="/TabelasComissaoVendedor" element={<LayoutWrapper currentPageName="TabelasComissaoVendedor"><TabelasComissaoVendedor /></LayoutWrapper>} />
      <Route path="/IntegracaoFinantoBank" element={<LayoutWrapper currentPageName="IntegracaoFinantoBank"><IntegracaoFinantoBank /></LayoutWrapper>} />
      <Route path="/DebugFinanto" element={<LayoutWrapper currentPageName="DebugFinanto"><DebugFinanto /></LayoutWrapper>} />
      <Route path="/ReconectarWhatsApp" element={<LayoutWrapper currentPageName="ReconectarWhatsApp"><ReconectarWhatsApp /></LayoutWrapper>} />
      <Route path="/FuncionariosColaboradores" element={<LayoutWrapper currentPageName="FuncionariosColaboradores"><FuncionariosColaboradores /></LayoutWrapper>} />
      <Route path="/FolhaSalarial" element={<LayoutWrapper currentPageName="FolhaSalarial"><FolhaSalarialPage /></LayoutWrapper>} />
      <Route path="/AdiantamentosFuncionarios" element={<LayoutWrapper currentPageName="AdiantamentosFuncionarios"><AdiantamentosFuncionarios /></LayoutWrapper>} />
      <Route path="/RelatorioFuncionarios" element={<LayoutWrapper currentPageName="RelatorioFuncionarios"><RelatorioFuncionarios /></LayoutWrapper>} />
      <Route path="/ContasBancarias" element={<LayoutWrapper currentPageName="ContasBancarias"><ContasBancarias /></LayoutWrapper>} />
      <Route path="/LancamentoFaltas" element={<LayoutWrapper currentPageName="LancamentoFaltas"><LancamentoFaltas /></LayoutWrapper>} />
      <Route path="/DashboardSeguros" element={<LayoutWrapper currentPageName="DashboardSeguros"><DashboardSeguros /></LayoutWrapper>} />
      <Route path="/Seguros" element={<LayoutWrapper currentPageName="Seguros"><Seguros /></LayoutWrapper>} />
      <Route path="/RenovacoesSeguro" element={<LayoutWrapper currentPageName="RenovacoesSeguro"><RenovacoesSeguro /></LayoutWrapper>} />
      <Route path="/CobrancaSeguro" element={<LayoutWrapper currentPageName="CobrancaSeguro"><CobrancaSeguro /></LayoutWrapper>} />
      <Route path="/ConfiguracaoSeguros" element={<LayoutWrapper currentPageName="ConfiguracaoSeguros"><ConfiguracaoSeguros /></LayoutWrapper>} />
      <Route path="/FinanciamentoVeiculos" element={<LayoutWrapper currentPageName="FinanciamentoVeiculos"><FinanciamentoVeiculos /></LayoutWrapper>} />
      <Route path="/ConfiguracaoFunis" element={<LayoutWrapper currentPageName="ConfiguracaoFunis"><ConfiguracaoFunis /></LayoutWrapper>} />
      <Route path="/AutomacaoFunis" element={<LayoutWrapper currentPageName="AutomacaoFunis"><AutomacaoFunis /></LayoutWrapper>} />
      <Route path="/ConfiguracaoWhatsappPessoal" element={<LayoutWrapper currentPageName="ConfiguracaoWhatsappPessoal"><ConfiguracaoWhatsappPessoal /></LayoutWrapper>} />
      <Route path="/CallCenter" element={<LayoutWrapper currentPageName="CallCenter"><CallCenter /></LayoutWrapper>} />
      <Route path="/ConfiguracaoSetoresTarefas" element={<LayoutWrapper currentPageName="ConfiguracaoSetoresTarefas"><ConfiguracaoSetoresTarefas /></LayoutWrapper>} />
      <Route path="/SimuladorInteligente" element={<LayoutWrapper currentPageName="SimuladorInteligente"><SimuladorInteligente /></LayoutWrapper>} />
      <Route path="/DiagnosticoNvoip" element={<LayoutWrapper currentPageName="DiagnosticoNvoip"><DiagnosticoNvoip /></LayoutWrapper>} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App