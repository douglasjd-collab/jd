import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import Usuarios from './pages/Usuarios';
import Administradoras from './pages/Administradoras';
import TabelasConsorcio from './pages/TabelasConsorcio';
import PlanosConsorcio from './pages/PlanosConsorcio';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Clientes": Clientes,
    "Usuarios": Usuarios,
    "Administradoras": Administradoras,
    "TabelasConsorcio": TabelasConsorcio,
    "PlanosConsorcio": PlanosConsorcio,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};