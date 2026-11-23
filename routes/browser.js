import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireProjectAccess } from '../utils/projectGuard.js';
import { userHasProjectAccess, getProjectByName } from '../services/projectService.js';
import { browserSessions } from '../services/browserSessions.js';

const start=z.object({projectName:z.string().trim().min(1).max(200),targetUrl:z.string().url().max(2000)});
const coordinate=z.number().finite().min(0);
const command=z.discriminatedUnion('type',[
    z.object({type:z.literal('click'),x:coordinate.max(1279),y:coordinate.max(719)}),
    z.object({type:z.literal('wheel'),x:coordinate.max(1279),y:coordinate.max(719),delta:z.number().finite().min(-1500).max(1500)}),
    z.object({type:z.literal('text'),text:z.string().min(1).max(2000)}),
    z.object({type:z.literal('fill'),text:z.string().max(2000)}),
    z.object({type:z.literal('select'),value:z.string().max(2000)}),
    z.object({type:z.literal('key'),key:z.enum(['Enter','Tab','Shift+Tab','Escape','Backspace','Delete','ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End','ControlOrMeta+A','Space'])}),
    z.object({type:z.literal('goto'),url:z.string().url().max(2000)}),
    z.object({type:z.literal('assert'),text:z.string().trim().min(1).max(2000)}),
]);
export function createBrowserRouter({sessions=browserSessions,auth=requireAuth,projectGuard=requireProjectAccess,hasAccess=userHasProjectAccess,findProject=getProjectByName}={}) {
    const router=express.Router();router.use(auth);
    router.post('/browser/start',async(req,res,next)=>{
        const parsed=start.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Proje ve geçerli hedef URL gereklidir.'});req.body=parsed.data;next();
    },projectGuard,async(req,res,next)=>{try{
        if(!await findProject(req.body.projectName))return res.status(404).json({error:'Proje bulunamadı.'});
        const s=await sessions.start({...req.body,owner:req.user.id});res.json({success:true,session:sessions.info(s)});
    }catch(e){next(e);}});
    router.use('/browser/:id',async(req,res,next)=>{try{
        if(!z.string().uuid().safeParse(req.params.id).success)return res.status(404).json({error:'Oturum bulunamadı.'});
        req.browserSession=sessions.get(req.params.id,req.user.id);
        if(req.user.role!=='ADMIN' && !await hasAccess(req.user,req.browserSession.projectName))return res.status(403).json({error:'Proje erişimi kaldırılmış.'});
        res.set('Cache-Control','no-store');next();
    }catch(e){next(e);}});
    router.get('/browser/:id', (req,res)=>res.json({success:true,session:sessions.info(req.browserSession)}));
    router.get('/browser/:id/frame',async(req,res,next)=>{try{const frame=await sessions.frame(req.browserSession);if(!frame)return res.status(204).end();res.type('jpeg').send(frame);}catch(e){next(e);}});
    router.post('/browser/:id/control',async(req,res,next)=>{try{
        const parsed=command.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Geçersiz tarayıcı komutu.'});
        await sessions.control(req.browserSession,parsed.data);res.json({success:true});
    }catch(e){next(e);}});
    router.post('/browser/:id/stop',async(req,res,next)=>{try{res.json({success:true,...await sessions.stop(req.browserSession)});}catch(e){next(e);}});
    router.post('/browser/:id/close',async(req,res,next)=>{try{
        if(req.browserSession.mode==='live')return res.status(403).json({error:'Çalışan test bu ekrandan kapatılamaz.'});
        await sessions.close(req.browserSession);res.json({success:true});
    }catch(e){next(e);}});
    return router;
}
export default createBrowserRouter();
